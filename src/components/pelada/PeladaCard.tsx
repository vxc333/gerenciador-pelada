import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Link as LinkIcon,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  UserPlus,
  MapPin,
  Clock,
  Users,
  Trophy,
} from "lucide-react";
import { formatDateBrasiliaLong } from "@/lib/datetime-br";
import type { Tables } from "@/integrations/supabase/types";

type PeladaRow = Tables<"peladas">;
type JoinRequestStatus = Tables<"pelada_join_requests">["status"];

export interface PeladaCard extends PeladaRow {
  confirmed_count?: number;
  my_request_status?: JoinRequestStatus | null;
  is_member?: boolean;
  is_confirmed?: boolean;
  is_admin?: boolean;
  pending_requests_count?: number;
}

interface PeladaCardProps {
  pelada: PeladaCard;
  showAdminActions?: boolean;
  availableCard?: boolean;
  isNextUpcoming?: boolean;
  profileBlocked?: boolean;
  onCopyLink: (id: string) => void;
  onDelete?: (id: string) => void;
  onLeave?: (pelada: PeladaCard) => void;
  onConfirm?: (pelada: PeladaCard) => void;
  onRequestJoin?: (peladaId: string) => void;
}

const formatDate = (dateStr: string) => {
  try {
    return formatDateBrasiliaLong(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
};

const formatOpenAt = (openDateTime: string) => {
  try {
    const d = new Date(openDateTime);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return openDateTime;
  }
};

export const PeladaCardComponent = memo(function PeladaCard({
  pelada: p,
  showAdminActions = false,
  availableCard = false,
  isNextUpcoming = false,
  profileBlocked = false,
  onCopyLink,
  onDelete,
  onLeave,
  onConfirm,
  onRequestJoin,
}: PeladaCardProps) {
  const confirmedCount = p.confirmed_count || 0;
  const maxPlayers = p.max_players || 0;
  const fillPct = maxPlayers > 0 ? Math.min(100, Math.round((confirmedCount / maxPlayers) * 100)) : 0;

  return (
    <div
      className={[
        "rounded-xl border p-4 transition-all duration-200 card-hover animate-slide-up",
        isNextUpcoming
          ? "border-primary/60 bg-gradient-to-br from-primary/10 to-card shadow-lg glow-primary"
          : "border-border bg-card",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNextUpcoming && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                próxima
              </span>
            )}
            <h3
              className={`truncate font-display text-lg leading-tight ${
                isNextUpcoming ? "text-primary" : "text-foreground"
              }`}
            >
              {p.title}
            </h3>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              {formatDate(p.date)}
            </span>
            {p.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {p.location}
              </span>
            )}
            {p.time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {p.time}
              </span>
            )}
          </div>

          {maxPlayers > 0 && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {confirmedCount} / {maxPlayers} confirmados
                </span>
                <span className="text-muted-foreground">{fillPct}%</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {p.num_teams}×{p.players_per_team} · {p.max_goalkeepers} goleiros
            </span>
            <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
              abre {formatOpenAt(p.confirmations_open_at)}
            </span>
            {p.draw_done_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                <Trophy className="h-3 w-3" /> sorteio feito
              </span>
            )}
            {availableCard && p.my_request_status === "pending" && (
              <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                aguardando aprovação
              </span>
            )}
            {availableCard && p.my_request_status === "rejected" && (
              <span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                solicitação recusada
              </span>
            )}
            {availableCard && p.is_member && (
              <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                membro aprovado
              </span>
            )}
            {availableCard && p.is_admin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                <Shield className="h-3 w-3" /> admin
              </span>
            )}
            {(showAdminActions || p.is_admin) && (p.pending_requests_count || 0) > 0 && (
              <span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                {p.pending_requests_count} pendente(s)
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopyLink(p.id)}
            title="Copiar link"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          {showAdminActions && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(p.id)}
              title="Excluir"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {availableCard && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {p.is_admin ? (
            <Link to={`/admin/${p.id}`} className="flex-1">
              <Button className="w-full gap-2">
                <Shield className="h-4 w-4" />
                Gerenciar
              </Button>
            </Link>
          ) : p.is_member ? (
            <>
              <Link to={`/pelada/${p.id}`} className="flex-1">
                <Button className="w-full">Abrir pelada</Button>
              </Link>
              {p.is_confirmed ? (
                <Button
                  className="w-full sm:w-auto"
                  variant="destructive"
                  onClick={() => onLeave?.(p)}
                >
                  Sair da lista
                </Button>
              ) : (
                <Button
                  className="w-full sm:w-auto"
                  variant="default"
                  disabled={profileBlocked}
                  onClick={() => onConfirm?.(p)}
                >
                  Confirmar agora
                </Button>
              )}
            </>
          ) : p.my_request_status === "pending" ? (
            <Button className="w-full" disabled>
              Solicitação enviada
            </Button>
          ) : p.my_request_status === "rejected" ? (
            <Button className="w-full" disabled>
              Aguardando novo convite do admin
            </Button>
          ) : !profileBlocked ? (
            <Button className="w-full gap-2" onClick={() => onRequestJoin?.(p.id)}>
              <UserPlus className="h-4 w-4" />
              Solicitar entrada
            </Button>
          ) : null}
        </div>
      )}

      {showAdminActions && !availableCard && (
        <div className="mt-3 flex gap-2">
          <Link to={`/admin/${p.id}`} className="flex-1">
            <Button className="w-full gap-2">
              <SettingsIcon className="h-4 w-4" />
              Gerenciar pelada
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
});
