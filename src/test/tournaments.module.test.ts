import { describe, expect, it } from "vitest";
import {
  assertCanTransitionTournamentStatus,
  buildTournamentStats,
  canTransitionTournamentStatus,
  generateTournamentFixtures,
  isReadOnlyStatus,
  type MatchResultPayload,
  type TournamentMatch,
} from "@/modules/tournaments";

describe("tournament lifecycle", () => {
  it("allows valid transitions", () => {
    expect(canTransitionTournamentStatus("DRAFT", "INSCRICOES_ABERTAS")).toBe(true);
    expect(canTransitionTournamentStatus("INSCRICOES_ABERTAS", "INSCRICOES_ENCERRADAS")).toBe(true);
    expect(canTransitionTournamentStatus("FINALIZADO", "ARQUIVADO")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransitionTournamentStatus("DRAFT", "EM_ANDAMENTO")).toBe(false);
    expect(canTransitionTournamentStatus("ARQUIVADO", "DRAFT")).toBe(false);
    expect(() => assertCanTransitionTournamentStatus("DRAFT", "EM_ANDAMENTO")).toThrow();
  });

  it("marks final states as readonly", () => {
    expect(isReadOnlyStatus("FINALIZADO")).toBe(true);
    expect(isReadOnlyStatus("ARQUIVADO")).toBe(true);
    expect(isReadOnlyStatus("EM_ANDAMENTO")).toBe(false);
  });
});

describe("tournament fixtures", () => {
  it("generates round-robin fixtures", () => {
    const fixtures = generateTournamentFixtures({
      tournamentId: "t-1",
      tipoTorneio: "LIGA",
      teams: [
        { teamId: "A", nome: "A" },
        { teamId: "B", nome: "B" },
        { teamId: "C", nome: "C" },
        { teamId: "D", nome: "D" },
      ],
    });

    expect(fixtures.length).toBe(6);
    expect(fixtures.every((fx) => fx.fase === "LIGA")).toBe(true);
  });

  it("generates knockout fixtures", () => {
    const fixtures = generateTournamentFixtures({
      tournamentId: "t-2",
      tipoTorneio: "MATA_MATA",
      teams: [
        { teamId: "A", nome: "A", seed: 1 },
        { teamId: "B", nome: "B", seed: 2 },
        { teamId: "C", nome: "C", seed: 3 },
        { teamId: "D", nome: "D", seed: 4 },
      ],
      seedEnabled: true,
    });

    expect(fixtures.length).toBe(2);
    expect(fixtures.every((fx) => fx.fase === "MATA_MATA")).toBe(true);
  });

  it("generates group fixtures", () => {
    const fixtures = generateTournamentFixtures({
      tournamentId: "t-3",
      tipoTorneio: "GRUPOS_COM_MATA_MATA",
      teams: [
        { teamId: "A", nome: "A", seed: 1 },
        { teamId: "B", nome: "B", seed: 2 },
        { teamId: "C", nome: "C", seed: 3 },
        { teamId: "D", nome: "D", seed: 4 },
      ],
      groupCount: 2,
    });

    expect(fixtures.length).toBe(2);
    expect(fixtures.every((fx) => fx.fase === "GRUPOS")).toBe(true);
  });
});

describe("tournament stats", () => {
  it("counts only validated results", () => {
    const matches: TournamentMatch[] = [
      {
        id: "m-1",
        tournamentId: "t-1",
        fase: "LIGA",
        timeCasaId: "A",
        timeForaId: "B",
        status: "FINALIZADO",
      },
      {
        id: "m-2",
        tournamentId: "t-1",
        fase: "LIGA",
        timeCasaId: "A",
        timeForaId: "B",
        status: "FINALIZADO",
      },
    ];

    const results: MatchResultPayload[] = [
      {
        matchId: "m-1",
        tournamentId: "t-1",
        status: "VALIDADO",
        golsCasa: 2,
        golsFora: 1,
        gols: [
          { jogadorId: "p1", timeId: "A", assistenciaJogadorId: "p2" },
          { jogadorId: "p1", timeId: "A" },
          { jogadorId: "p3", timeId: "B" },
        ],
        cartoes: [
          { jogadorId: "p1", tipo: "AMARELO" },
          { jogadorId: "p3", tipo: "VERMELHO" },
        ],
        mvpJogadorId: "p1",
      },
      {
        matchId: "m-2",
        tournamentId: "t-1",
        status: "RASCUNHO",
        golsCasa: 0,
        golsFora: 0,
        gols: [{ jogadorId: "p1", timeId: "A" }],
        cartoes: [{ jogadorId: "p1", tipo: "AMARELO" }],
      },
    ];

    const stats = buildTournamentStats(matches, results, {
      p1: "A",
      p2: "A",
      p3: "B",
    });

    const p1 = stats.find((x) => x.jogadorId === "p1");
    const p2 = stats.find((x) => x.jogadorId === "p2");
    const p3 = stats.find((x) => x.jogadorId === "p3");

    expect(p1?.gols).toBe(2);
    expect(p1?.jogos).toBe(1);
    expect(p1?.amarelos).toBe(1);
    expect(p1?.mvp).toBe(1);

    expect(p2?.assistencias).toBe(1);
    expect(p2?.jogos).toBe(1);

    expect(p3?.vermelhos).toBe(1);
    expect(p3?.gols).toBe(1);
    expect(p3?.jogos).toBe(1);
  });
});
