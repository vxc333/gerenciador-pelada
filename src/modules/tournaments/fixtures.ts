import type { TeamSeed, TournamentMatch } from "./types";

interface FixtureIdFactory {
  next: () => string;
}

const createFixtureIdFactory = (): FixtureIdFactory => {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `fx-${counter}`;
    },
  };
};

const buildRoundRobin = (teams: TeamSeed[], tournamentId: string): TournamentMatch[] => {
  if (teams.length < 2) return [];

  const idFactory = createFixtureIdFactory();
  const normalized = [...teams];
  const hasBye = normalized.length % 2 !== 0;

  if (hasBye) {
    normalized.push({ teamId: "BYE", nome: "BYE" });
  }

  const rounds = normalized.length - 1;
  const half = normalized.length / 2;
  const fixtures: TournamentMatch[] = [];
  let rotating = [...normalized];

  for (let round = 1; round <= rounds; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const home = rotating[i];
      const away = rotating[rotating.length - 1 - i];
      if (home.teamId === "BYE" || away.teamId === "BYE") continue;

      fixtures.push({
        id: idFactory.next(),
        tournamentId,
        fase: "LIGA",
        rodada: round,
        timeCasaId: home.teamId,
        timeForaId: away.teamId,
        status: "AGENDADO",
      });
    }

    const [fixed, ...rest] = rotating;
    const last = rest.pop();
    if (!last) break;
    rotating = [fixed, last, ...rest];
  }

  return fixtures;
};

const padToPowerOfTwo = (teams: TeamSeed[]): TeamSeed[] => {
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(Math.max(2, teams.length))));
  const padded = [...teams];

  while (padded.length < nextPow2) {
    padded.push({ teamId: `BYE-${padded.length}`, nome: "BYE" });
  }

  return padded;
};

export const buildKnockoutBracket = (teams: TeamSeed[], tournamentId: string, useSeed = false): TournamentMatch[] => {
  if (teams.length < 2) return [];

  const idFactory = createFixtureIdFactory();
  const sorted = useSeed
    ? [...teams].sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER))
    : [...teams];

  const bracketTeams = padToPowerOfTwo(sorted);
  const matches: TournamentMatch[] = [];

  for (let i = 0; i < bracketTeams.length; i += 2) {
    const home = bracketTeams[i];
    const away = bracketTeams[i + 1];

    if (!home || !away || home.teamId.startsWith("BYE") || away.teamId.startsWith("BYE")) continue;

    matches.push({
      id: idFactory.next(),
      tournamentId,
      fase: "MATA_MATA",
      rodada: 1,
      timeCasaId: home.teamId,
      timeForaId: away.teamId,
      status: "AGENDADO",
    });
  }

  return matches;
};

export const buildGroupStage = (
  teams: TeamSeed[],
  tournamentId: string,
  groupCount: number,
  groupPrefix = "GRUPO"
): TournamentMatch[] => {
  if (groupCount <= 0 || teams.length < 2) return [];

  const groups: TeamSeed[][] = Array.from({ length: groupCount }, () => []);
  const ranked = [...teams].sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER));

  ranked.forEach((team, idx) => {
    const groupIdx = idx % groupCount;
    groups[groupIdx].push(team);
  });

  const idFactory = createFixtureIdFactory();
  const matches: TournamentMatch[] = [];

  groups.forEach((groupTeams, idx) => {
    const groupLabel = `${groupPrefix} ${String.fromCharCode(65 + idx)}`;

    for (let i = 0; i < groupTeams.length; i += 1) {
      for (let j = i + 1; j < groupTeams.length; j += 1) {
        const home = groupTeams[i];
        const away = groupTeams[j];
        if (!home || !away) continue;

        matches.push({
          id: idFactory.next(),
          tournamentId,
          fase: "GRUPOS",
          grupo: groupLabel,
          timeCasaId: home.teamId,
          timeForaId: away.teamId,
          status: "AGENDADO",
        });
      }
    }
  });

  return matches;
};

export const generateTournamentFixtures = (params: {
  tournamentId: string;
  tipoTorneio: "LIGA" | "MATA_MATA" | "GRUPOS_COM_MATA_MATA";
  teams: TeamSeed[];
  seedEnabled?: boolean;
  groupCount?: number;
}) => {
  const { tournamentId, tipoTorneio, teams, seedEnabled = false, groupCount = 4 } = params;

  if (tipoTorneio === "LIGA") {
    return buildRoundRobin(teams, tournamentId);
  }

  if (tipoTorneio === "MATA_MATA") {
    return buildKnockoutBracket(teams, tournamentId, seedEnabled);
  }

  return buildGroupStage(teams, tournamentId, groupCount);
};
