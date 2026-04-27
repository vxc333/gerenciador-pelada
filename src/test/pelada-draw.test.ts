import { describe, expect, it } from "vitest";
import { generatePeladaDraw, type DrawParticipant } from "@/lib/pelada-draw";

const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const member = (suffix: string): DrawParticipant => ({
  id: `member-${suffix}`,
  displayName: `Membro ${suffix}`,
  kind: "member",
  userId: `u-${suffix}`,
  hostUserId: `u-${suffix}`,
});

const guest = (suffix: string, hostSuffix: string): DrawParticipant => ({
  id: `guest-${suffix}`,
  displayName: `Convidado ${suffix}`,
  kind: "guest",
  userId: null,
  hostUserId: `u-${hostSuffix}`,
});

describe("pelada draw", () => {
  it("respeita pares proibidos", () => {
    const participants: DrawParticipant[] = [
      { ...member("A"), displayName: "Alice" },
      { ...member("B"), displayName: "Bruno" },
      member("C"),
      member("D"),
      member("E"),
      member("F"),
      member("G"),
      member("H"),
    ];

    const result = generatePeladaDraw({
      participants,
      numTeams: 2,
      previousDraws: [],
      constraints: {
        blockedPairs: [["Alice", "Bruno"]],
        avoidSameHostGuests: true,
        ensureGuestPerTeam: false,
        ensureHostWithOwnGuest: false,
        avoidRecentPairs: false,
      },
      randomFn: seededRandom(10),
    });

    expect(result.diagnostics.blockedPairViolations).toBe(0);

    const aliceTeam = result.teams.find((team) => team.players.includes("Alice"));
    expect(aliceTeam?.players.includes("Bruno")).toBe(false);
  });

  it("distribui convidado por time quando possível", () => {
    const participants: DrawParticipant[] = [
      member("1"),
      member("2"),
      member("3"),
      member("4"),
      guest("1", "1"),
      guest("2", "2"),
      guest("3", "3"),
      guest("4", "4"),
    ];

    const result = generatePeladaDraw({
      participants,
      numTeams: 4,
      previousDraws: [],
      constraints: {
        blockedPairs: [],
        avoidSameHostGuests: true,
        ensureGuestPerTeam: true,
        ensureHostWithOwnGuest: true,
        avoidRecentPairs: false,
      },
      randomFn: seededRandom(12),
    });

    expect(result.diagnostics.teamsWithoutGuest).toBe(0);
    expect(result.diagnostics.hostsMissingOwnGuest).toBe(0);
  });

  it("aceita colisão inevitável de convidados do mesmo responsável", () => {
    const participants: DrawParticipant[] = [
      member("1"),
      member("2"),
      member("3"),
      member("4"),
      member("5"),
      member("6"),
      member("7"),
      member("8"),
      guest("1", "1"),
      guest("2", "1"),
      guest("3", "1"),
      guest("4", "1"),
      guest("5", "1"),
    ];

    const result = generatePeladaDraw({
      participants,
      numTeams: 4,
      previousDraws: [],
      constraints: {
        blockedPairs: [],
        avoidSameHostGuests: true,
        ensureGuestPerTeam: true,
        ensureHostWithOwnGuest: true,
        avoidRecentPairs: false,
      },
      randomFn: seededRandom(44),
    });

    expect(result.diagnostics.unavoidableSameHostGuestCollisions).toBe(1);
    expect(result.diagnostics.sameHostGuestCollisions).toBeGreaterThanOrEqual(1);
  });

  it("evita repetir pares dos sorteios recentes quando há alternativa", () => {
    const participants: DrawParticipant[] = [
      { ...member("A"), displayName: "A" },
      { ...member("B"), displayName: "B" },
      { ...member("C"), displayName: "C" },
      { ...member("D"), displayName: "D" },
    ];

    const result = generatePeladaDraw({
      participants,
      numTeams: 2,
      previousDraws: [
        [
          { team: 1, players: ["A", "B"] },
          { team: 2, players: ["C", "D"] },
        ],
      ],
      constraints: {
        blockedPairs: [],
        avoidSameHostGuests: false,
        ensureGuestPerTeam: false,
        ensureHostWithOwnGuest: false,
        avoidRecentPairs: true,
      },
      randomFn: seededRandom(22),
    });

    expect(result.diagnostics.repeatedRecentPairs).toBe(0);
  });
});
