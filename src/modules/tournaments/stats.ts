import type { MatchResultPayload, PlayerTournamentStats, TournamentMatch } from "./types";

const initialStats = (): Omit<PlayerTournamentStats, "jogadorId"> => ({
  jogos: 0,
  gols: 0,
  assistencias: 0,
  amarelos: 0,
  vermelhos: 0,
  mvp: 0,
  mediaGols: 0,
  fairPlay: 100,
});

export const buildTournamentStats = (
  matches: TournamentMatch[],
  results: MatchResultPayload[],
  activePlayerTeam: Record<string, string>
): PlayerTournamentStats[] => {
  const stats = new Map<string, Omit<PlayerTournamentStats, "jogadorId">>();
  const validatedByMatch = new Map<string, MatchResultPayload>();

  results.forEach((result) => {
    if (result.status === "VALIDADO") {
      validatedByMatch.set(result.matchId, result);
    }
  });

  const ensure = (playerId: string) => {
    const existing = stats.get(playerId);
    if (existing) return existing;
    const created = initialStats();
    stats.set(playerId, created);
    return created;
  };

  matches.forEach((match) => {
    const result = validatedByMatch.get(match.id);
    if (!result) return;

    Object.entries(activePlayerTeam).forEach(([playerId, teamId]) => {
      if (teamId === match.timeCasaId || teamId === match.timeForaId) {
        ensure(playerId).jogos += 1;
      }
    });

    result.gols.forEach((goal) => {
      ensure(goal.jogadorId).gols += 1;
      if (goal.assistenciaJogadorId) {
        ensure(goal.assistenciaJogadorId).assistencias += 1;
      }
    });

    result.cartoes.forEach((card) => {
      const s = ensure(card.jogadorId);
      if (card.tipo === "AMARELO") s.amarelos += 1;
      if (card.tipo === "VERMELHO") s.vermelhos += 1;
    });

    if (result.mvpJogadorId) {
      ensure(result.mvpJogadorId).mvp += 1;
    }
  });

  return Array.from(stats.entries()).map(([jogadorId, s]) => {
    const mediaGols = s.jogos > 0 ? s.gols / s.jogos : 0;
    const fairPlay = Math.max(0, 100 - s.amarelos * 5 - s.vermelhos * 20);

    return {
      jogadorId,
      ...s,
      mediaGols,
      fairPlay,
    };
  });
};
