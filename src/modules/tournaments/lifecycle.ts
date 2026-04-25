import type { TournamentStatus } from "./types";

const allowedTransitions: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ["INSCRICOES_ABERTAS", "ARQUIVADO"],
  INSCRICOES_ABERTAS: ["INSCRICOES_ENCERRADAS", "ARQUIVADO"],
  INSCRICOES_ENCERRADAS: ["TABELA_GERADA", "INSCRICOES_ABERTAS", "ARQUIVADO"],
  TABELA_GERADA: ["EM_ANDAMENTO", "INSCRICOES_ENCERRADAS", "ARQUIVADO"],
  EM_ANDAMENTO: ["FINALIZADO", "ARQUIVADO"],
  FINALIZADO: ["ARQUIVADO"],
  ARQUIVADO: [],
};

export const isReadOnlyStatus = (status: TournamentStatus) => status === "FINALIZADO" || status === "ARQUIVADO";

export const canTransitionTournamentStatus = (from: TournamentStatus, to: TournamentStatus) => {
  if (from === to) return true;
  return allowedTransitions[from].includes(to);
};

export const assertCanTransitionTournamentStatus = (from: TournamentStatus, to: TournamentStatus) => {
  if (!canTransitionTournamentStatus(from, to)) {
    throw new Error(`Transicao invalida de ${from} para ${to}`);
  }
};

export const assertTournamentWritable = (status: TournamentStatus) => {
  if (isReadOnlyStatus(status)) {
    throw new Error("Torneio finalizado/arquivado em modo somente leitura");
  }
};
