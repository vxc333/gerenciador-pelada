import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trophy } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { TournamentStatus } from "@/modules/tournaments";

type TournamentRow = Tables<"tournaments"> & { group_stage_groups_count: number | null };

const statusLabel: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  INSCRICOES_ABERTAS: "Inscrições abertas",
  INSCRICOES_ENCERRADAS: "Inscrições encerradas",
  TABELA_GERADA: "Tabela gerada",
  EM_ANDAMENTO: "Em andamento",
  FINALIZADO: "Finalizado",
  ARQUIVADO: "Arquivado",
};

const statusVariant = (status: TournamentStatus): "default" | "secondary" | "outline" => {
  if (status === "FINALIZADO" || status === "ARQUIVADO") return "secondary";
  if (status === "EM_ANDAMENTO") return "default";
  return "outline";
};

const typeLabel: Record<string, string> = {
  LIGA: "Liga",
  MATA_MATA: "Mata-mata",
  GRUPOS_COM_MATA_MATA: "Grupos + Mata-mata",
};

interface TournamentsSectionProps {
  userId: string;
  isSystemAdmin: boolean;
}

export function TournamentsSection({ userId, isSystemAdmin }: TournamentsSectionProps) {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    const [
      { data: allTournaments },
      { data: adminRows },
      { data: participantLinksRows },
      { data: ownedTeamsRows },
      { data: teamPlayersRows },
    ] = await Promise.all([
      supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
      supabase.from("tournament_admins").select("tournament_id").eq("user_id", userId),
      supabase.from("tournament_player_team_links").select("tournament_id").eq("user_id", userId),
      supabase.from("tournament_teams").select("tournament_id").eq("owner_user_id", userId),
      supabase.from("tournament_team_players").select("tournament_id").eq("user_id", userId),
    ]);

    const adminIds = new Set<string>([
      ...(allTournaments || []).filter((t) => t.created_by === userId).map((t) => t.id),
      ...(adminRows || []).map((r) => r.tournament_id),
    ]);

    const participantIds = new Set<string>([
      ...(participantLinksRows || []).map((r) => r.tournament_id),
      ...(ownedTeamsRows || []).map((r) => r.tournament_id),
      ...(teamPlayersRows || []).map((r) => r.tournament_id),
    ]);

    const visible = ((allTournaments || []) as TournamentRow[]).filter((t) => {
      if (isSystemAdmin) return true;
      if (adminIds.has(t.id)) return true;
      if (participantIds.has(t.id)) return true;
      return t.status === "INSCRICOES_ABERTAS";
    });

    setTournaments(
      Array.from(new Map(visible.map((t) => [t.id, t])).values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
    setLoading(false);
  }, [isSystemAdmin, userId]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl tracking-widest text-foreground">TORNEIOS</h2>
          <p className="text-sm text-muted-foreground">Torneios que você participa ou pode se inscrever.</p>
        </div>
        {isSystemAdmin && (
          <Link to="/admin/torneios">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Gerenciar
            </Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum torneio disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t.id} className="rounded-lg border border-border/50 bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(t.status as TournamentStatus)} className="shrink-0 text-xs">
                  {statusLabel[t.status as TournamentStatus] ?? t.status}
                </Badge>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {typeLabel[t.tournament_type] ?? t.tournament_type}
                </Badge>
              </div>
              <p className="font-semibold leading-snug text-foreground">{t.name}</p>
              {t.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              )}
              {t.max_teams && (
                <p className="mt-1 text-xs text-muted-foreground">Limite: {t.max_teams} times</p>
              )}
              <div className="mt-3">
                <Link to="/admin/torneios">
                  <Button size="sm" variant="outline" className="w-full sm:w-auto">
                    Ver torneio
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
