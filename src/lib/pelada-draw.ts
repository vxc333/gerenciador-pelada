export type DrawTeam = { team: number; players: string[] };

export type DrawParticipant = {
  id: string;
  displayName: string;
  kind: "member" | "guest";
  userId: string | null;
  hostUserId: string | null;
};

export type DrawConstraints = {
  blockedPairs: Array<[string, string]>;
  avoidSameHostGuests: boolean;
  ensureGuestPerTeam: boolean;
  ensureHostWithOwnGuest: boolean;
  avoidRecentPairs: boolean;
};

export type DrawDiagnostics = {
  blockedPairViolations: number;
  repeatedRecentPairs: number;
  repeatedRecentTeams: number;
  teamsWithoutGuest: number;
  unavoidableTeamsWithoutGuest: number;
  sameHostGuestCollisions: number;
  unavoidableSameHostGuestCollisions: number;
  hostsMissingOwnGuest: number;
  score: number;
};

export type GenerateDrawResult = {
  teams: DrawTeam[];
  diagnostics: DrawDiagnostics;
  usedPreviousDraws: number;
};

export type GenerateDrawParams = {
  participants: DrawParticipant[];
  numTeams: number;
  previousDraws: DrawTeam[][];
  constraints: DrawConstraints;
  maxAttempts?: number;
  randomFn?: () => number;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const pairKey = (a: string, b: string) => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na < nb ? `${na}::${nb}` : `${nb}::${na}`;
};

const teamSignature = (names: string[]) => names.map(normalizeName).sort().join("::");

const shuffleWithRandom = <T>(input: T[], randomFn: () => number) => {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const parseBlockedPairs = (pairs: Array<[string, string]>) => {
  const keys = new Set<string>();

  for (const [left, right] of pairs) {
    const l = normalizeName(left);
    const r = normalizeName(right);
    if (!l || !r || l === r) continue;
    keys.add(l < r ? `${l}::${r}` : `${r}::${l}`);
  }

  return keys;
};

const createCapacities = (totalPlayers: number, numTeams: number) => {
  const baseSize = Math.floor(totalPlayers / numTeams);
  const extraTeams = totalPlayers % numTeams;

  return Array.from({ length: numTeams }, (_, idx) => (idx < extraTeams ? baseSize + 1 : baseSize));
};

const createEmptyAssignments = (numTeams: number) => Array.from({ length: numTeams }, () => [] as DrawParticipant[]);

type HistoricalStats = {
  pairSet: Set<string>;
  teamSignatures: Set<string>;
};

const buildHistoricalStats = (previousDraws: DrawTeam[][]): HistoricalStats => {
  const pairSet = new Set<string>();
  const teamSignatures = new Set<string>();

  for (const draw of previousDraws) {
    for (const team of draw) {
      if (!Array.isArray(team.players) || team.players.length === 0) continue;

      teamSignatures.add(teamSignature(team.players));

      for (let i = 0; i < team.players.length; i += 1) {
        for (let j = i + 1; j < team.players.length; j += 1) {
          pairSet.add(pairKey(team.players[i], team.players[j]));
        }
      }
    }
  }

  return { pairSet, teamSignatures };
};

const findGuestStats = (participants: DrawParticipant[]) => {
  const totalGuests = participants.filter((p) => p.kind === "guest").length;
  const hostGuestCounts = new Map<string, number>();

  for (const participant of participants) {
    if (participant.kind !== "guest" || !participant.hostUserId) continue;
    hostGuestCounts.set(participant.hostUserId, (hostGuestCounts.get(participant.hostUserId) || 0) + 1);
  }

  return { totalGuests, hostGuestCounts };
};

const evaluateAssignments = (
  assignments: DrawParticipant[][],
  historical: HistoricalStats,
  blockedPairSet: Set<string>,
  constraints: DrawConstraints,
  hostGuestCounts: Map<string, number>,
): DrawDiagnostics => {
  let blockedPairViolations = 0;
  let repeatedRecentPairs = 0;
  let repeatedRecentTeams = 0;
  let teamsWithoutGuest = 0;
  let sameHostGuestCollisions = 0;
  let hostsMissingOwnGuest = 0;
  const hostsWithOwnGuestOnSameTeam = new Set<string>();

  for (const team of assignments) {
    const guestByHost = new Map<string, number>();
    const teamMembers = new Set<string>();

    for (const participant of team) {
      if (participant.kind === "member" && participant.userId) {
        teamMembers.add(participant.userId);
      }

      if (participant.kind === "guest" && participant.hostUserId) {
        guestByHost.set(participant.hostUserId, (guestByHost.get(participant.hostUserId) || 0) + 1);
      }
    }

    const guestCount = team.filter((p) => p.kind === "guest").length;
    if (guestCount === 0) teamsWithoutGuest += 1;

    for (const [, count] of guestByHost) {
      if (count > 1) sameHostGuestCollisions += count - 1;
    }

    const names = team.map((p) => p.displayName);
    if (names.length > 1 && historical.teamSignatures.has(teamSignature(names))) {
      repeatedRecentTeams += 1;
    }

    for (let i = 0; i < team.length; i += 1) {
      for (let j = i + 1; j < team.length; j += 1) {
        const left = team[i];
        const right = team[j];

        if (blockedPairSet.has(pairKey(left.displayName, right.displayName))) {
          blockedPairViolations += 1;
        }

        if (historical.pairSet.has(pairKey(left.displayName, right.displayName))) {
          repeatedRecentPairs += 1;
        }
      }
    }

    for (const [hostUserId] of guestByHost) {
      if (!teamMembers.has(hostUserId)) continue;
      hostsWithOwnGuestOnSameTeam.add(hostUserId);
    }
  }

  for (const [hostUserId, guestCount] of hostGuestCounts) {
    if (guestCount <= 0) continue;
    const hasHostOnDraw = assignments.some((team) => team.some((p) => p.kind === "member" && p.userId === hostUserId));
    if (!hasHostOnDraw) continue;

    const hostHasOwnGuest = hostsWithOwnGuestOnSameTeam.has(hostUserId);

    if (!hostHasOwnGuest) hostsMissingOwnGuest += 1;
  }

  const totalGuests = Array.from(hostGuestCounts.values()).filter((value) => value > 0).reduce((acc, value) => acc + value, 0);
  const unavoidableTeamsWithoutGuest = Math.max(0, assignments.length - totalGuests);

  let unavoidableSameHostGuestCollisions = 0;
  for (const [, count] of hostGuestCounts) {
    if (count > 0) {
      unavoidableSameHostGuestCollisions += Math.max(0, count - assignments.length);
    }
  }

  const avoidableGuestlessTeams = Math.max(0, teamsWithoutGuest - unavoidableTeamsWithoutGuest);
  const avoidableHostGuestCollisions = Math.max(0, sameHostGuestCollisions - unavoidableSameHostGuestCollisions);

  let score = 0;
  score += blockedPairViolations * 20000;
  score += repeatedRecentPairs * 30;
  score += repeatedRecentTeams * 90;

  if (constraints.ensureGuestPerTeam) {
    score += avoidableGuestlessTeams * 260;
    score += Math.max(0, teamsWithoutGuest - avoidableGuestlessTeams) * 25;
  }

  if (constraints.avoidSameHostGuests) {
    score += avoidableHostGuestCollisions * 160;
    score += Math.max(0, sameHostGuestCollisions - avoidableHostGuestCollisions) * 30;
  }

  if (constraints.ensureHostWithOwnGuest) {
    score += hostsMissingOwnGuest * 180;
  }

  if (!constraints.avoidRecentPairs) {
    score -= repeatedRecentPairs * 30;
    score -= repeatedRecentTeams * 90;
  }

  return {
    blockedPairViolations,
    repeatedRecentPairs,
    repeatedRecentTeams,
    teamsWithoutGuest,
    unavoidableTeamsWithoutGuest,
    sameHostGuestCollisions,
    unavoidableSameHostGuestCollisions,
    hostsMissingOwnGuest,
    score,
  };
};

export const parseBlockedPairsText = (raw: string): Array<[string, string]> => {
  const lines = raw.split("\n");
  const result: Array<[string, string]> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const split = trimmed.includes("|")
      ? trimmed.split("|")
      : trimmed.includes(",")
      ? trimmed.split(",")
      : trimmed.includes(";")
      ? trimmed.split(";")
      : [];

    if (split.length < 2) continue;

    const left = split[0]?.trim() || "";
    const right = split[1]?.trim() || "";

    if (!left || !right) continue;

    result.push([left, right]);
  }

  return result;
};

export const generatePeladaDraw = (params: GenerateDrawParams): GenerateDrawResult => {
  const {
    participants,
    numTeams,
    previousDraws,
    constraints,
    maxAttempts = 700,
    randomFn = Math.random,
  } = params;

  if (numTeams <= 0) {
    return {
      teams: [],
      diagnostics: {
        blockedPairViolations: 0,
        repeatedRecentPairs: 0,
        repeatedRecentTeams: 0,
        teamsWithoutGuest: 0,
        unavoidableTeamsWithoutGuest: 0,
        sameHostGuestCollisions: 0,
        unavoidableSameHostGuestCollisions: 0,
        hostsMissingOwnGuest: 0,
        score: 0,
      },
      usedPreviousDraws: previousDraws.length,
    };
  }

  const capacities = createCapacities(participants.length, numTeams);
  const blockedPairSet = parseBlockedPairs(constraints.blockedPairs);
  const historical = buildHistoricalStats(previousDraws);
  const { hostGuestCounts } = findGuestStats(participants);

  let bestAssignments: DrawParticipant[][] | null = null;
  let bestDiagnostics: DrawDiagnostics | null = null;

  const participantsByPriority = [...participants].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "guest" ? -1 : 1;
    return left.displayName.localeCompare(right.displayName);
  });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const assignments = createEmptyAssignments(numTeams);
    const candidateParticipants = shuffleWithRandom(participantsByPriority, randomFn);
    let attemptFailed = false;

    for (const participant of candidateParticipants) {
      let bestLocalScore = Number.POSITIVE_INFINITY;
      const bestTeamIndexes: number[] = [];

      for (let teamIndex = 0; teamIndex < assignments.length; teamIndex += 1) {
        const team = assignments[teamIndex];
        if (team.length >= capacities[teamIndex]) continue;

        const createsBlockedPair = team.some((teammate) => blockedPairSet.has(pairKey(teammate.displayName, participant.displayName)));
        if (createsBlockedPair) continue;

        let localScore = team.length;

        if (participant.kind === "guest" && participant.hostUserId) {
          const sameHostGuests = team.filter((teammate) => teammate.kind === "guest" && teammate.hostUserId === participant.hostUserId).length;
          const hostIsOnTeam = team.some((teammate) => teammate.kind === "member" && teammate.userId === participant.hostUserId);

          if (constraints.avoidSameHostGuests) localScore += sameHostGuests * 50;
          if (constraints.ensureHostWithOwnGuest && hostIsOnTeam) localScore -= 22;
        }

        if (constraints.avoidRecentPairs) {
          for (const teammate of team) {
            if (historical.pairSet.has(pairKey(teammate.displayName, participant.displayName))) {
              localScore += 10;
            }
          }
        }

        if (constraints.ensureGuestPerTeam) {
          const hasGuest = team.some((teammate) => teammate.kind === "guest") || participant.kind === "guest";
          if (!hasGuest) localScore += 12;
        }

        if (localScore < bestLocalScore) {
          bestLocalScore = localScore;
          bestTeamIndexes.length = 0;
          bestTeamIndexes.push(teamIndex);
        } else if (localScore === bestLocalScore) {
          bestTeamIndexes.push(teamIndex);
        }
      }

      if (bestTeamIndexes.length === 0) {
        attemptFailed = true;
        break;
      }

      const selectedIndex = bestTeamIndexes[Math.floor(randomFn() * bestTeamIndexes.length)];
      assignments[selectedIndex].push(participant);
    }

    if (attemptFailed) continue;

    const diagnostics = evaluateAssignments(
      assignments,
      historical,
      blockedPairSet,
      constraints,
      new Map(hostGuestCounts),
    );

    if (!bestDiagnostics || diagnostics.score < bestDiagnostics.score) {
      bestAssignments = assignments;
      bestDiagnostics = diagnostics;
    }

    if (bestDiagnostics && bestDiagnostics.score === 0) break;
  }

  const resolvedAssignments = bestAssignments || createEmptyAssignments(numTeams);
  const diagnostics =
    bestDiagnostics ||
    evaluateAssignments(
      resolvedAssignments,
      historical,
      blockedPairSet,
      constraints,
      new Map(hostGuestCounts),
    );

  const teams: DrawTeam[] = resolvedAssignments.map((team, index) => ({
    team: index + 1,
    players: team.map((participant) => participant.displayName),
  }));

  return {
    teams,
    diagnostics,
    usedPreviousDraws: previousDraws.length,
  };
};
