export type TournamentStatus =
  | "DRAFT"
  | "INSCRICOES_ABERTAS"
  | "INSCRICOES_ENCERRADAS"
  | "TABELA_GERADA"
  | "EM_ANDAMENTO"
  | "FINALIZADO"
  | "ARQUIVADO";

export type TournamentType = "LIGA" | "MATA_MATA" | "GRUPOS_COM_MATA_MATA";

export type TieBreakerCriterion =
  | "PONTOS"
  | "SALDO_GOLS"
  | "GOLS_PRO"
  | "CONFRONTO_DIRETO"
  | "CARTOES"
  | "SORTEIO";

export type MatchStatus = "AGENDADO" | "EM_ANDAMENTO" | "FINALIZADO" | "WO";
export type MatchResultStatus = "RASCUNHO" | "VALIDADO";
export type CardType = "AMARELO" | "VERMELHO";

export type TeamInviteStatus = "PENDENTE" | "ACEITO" | "RECUSADO";

export interface TournamentRules {
  idaEVolta: boolean;
  criteriosDesempate: TieBreakerCriterion[];
  acumulacaoCartoes: boolean;
}

export interface TournamentDefinition {
  id: string;
  nome: string;
  descricao?: string;
  tipoTorneio: TournamentType;
  status: TournamentStatus;
  limiteDeTimes: boolean;
  quantidadeMaximaDeTimes?: number;
  torneioOficial: boolean;
  regras: TournamentRules;
  minimoJogadoresPorTime: number;
}

export interface TeamSeed {
  teamId: string;
  nome: string;
  seed?: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  fase: string;
  rodada?: number;
  grupo?: string;
  timeCasaId: string;
  timeForaId: string;
  status: MatchStatus;
}

export interface GoalEvent {
  jogadorId: string;
  timeId: string;
  assistenciaJogadorId?: string;
}

export interface CardEvent {
  jogadorId: string;
  tipo: CardType;
}

export interface MatchResultPayload {
  matchId: string;
  tournamentId: string;
  status: MatchResultStatus;
  golsCasa: number;
  golsFora: number;
  mvpJogadorId?: string;
  gols: GoalEvent[];
  cartoes: CardEvent[];
}

export interface PlayerTournamentStats {
  jogadorId: string;
  jogos: number;
  gols: number;
  assistencias: number;
  amarelos: number;
  vermelhos: number;
  mvp: number;
  mediaGols: number;
  fairPlay: number;
}
