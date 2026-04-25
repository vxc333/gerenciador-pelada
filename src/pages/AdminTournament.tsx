import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, PlayCircle, Save, ShieldCheck, Swords, Trophy, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageContent, PageSectionCard } from "@/components/layout/PageLayout";
import { PageState } from "@/components/layout/PageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assertCanTransitionTournamentStatus,
  canTransitionTournamentStatus,
  generateTournamentFixtures,
  type CardEvent,
  type GoalEvent,
  type TeamSeed,
  type TournamentMatch,
  type TournamentStatus,
  type TournamentType,
} from "@/modules/tournaments";

type TournamentRow = Tables<"tournaments">;
type TeamRow = Tables<"tournament_teams">;
type MatchRow = Tables<"tournament_matches">;
type MatchResultRow = Tables<"tournament_match_results">;
type LinkRow = Tables<"tournament_player_team_links">;
type ProfileRow = Tables<"user_profiles">;

const statusLabel: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  INSCRICOES_ABERTAS: "Inscrições abertas",
  INSCRICOES_ENCERRADAS: "Inscrições encerradas",
  TABELA_GERADA: "Tabela gerada",
  EM_ANDAMENTO: "Em andamento",
  FINALIZADO: "Finalizado",
  ARQUIVADO: "Arquivado",
};

const orderedStatus: TournamentStatus[] = [
  "DRAFT",
  "INSCRICOES_ABERTAS",
  "INSCRICOES_ENCERRADAS",
  "TABELA_GERADA",
  "EM_ANDAMENTO",
  "FINALIZADO",
  "ARQUIVADO",
];

interface CreateTournamentForm {
  nome: string;
  descricao: string;
  tipoTorneio: TournamentType;
  limiteDeTimes: boolean;
  quantidadeMaximaDeTimes: string;
  torneioOficial: boolean;
  idaEVolta: boolean;
  acumulacaoCartoes: boolean;
  criteriosDesempate: string;
  minimoJogadores: string;
}

interface MatchEditorState {
  match: MatchRow;
  currentResult: MatchResultRow | null;
  homeScore: string;
  awayScore: string;
  status: "RASCUNHO" | "VALIDADO";
  mvpUserId: string;
  goals: GoalEvent[];
  cards: CardEvent[];
}

const defaultForm: CreateTournamentForm = {
  nome: "",
  descricao: "",
  tipoTorneio: "LIGA",
  limiteDeTimes: false,
  quantidadeMaximaDeTimes: "",
  torneioOficial: false,
  idaEVolta: false,
  acumulacaoCartoes: true,
  criteriosDesempate: "PONTOS,SALDO_GOLS,GOLS_PRO",
  minimoJogadores: "5",
};

const statusVariant = (status: TournamentStatus): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "FINALIZADO" || status === "ARQUIVADO") return "secondary";
  if (status === "EM_ANDAMENTO") return "default";
  if (status === "INSCRICOES_ABERTAS") return "outline";
  return "outline";
};

const AdminTournament = () => {
  const { user, loading, profileChecked, hasProfileName } = useAuth();

  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [teamsByTournament, setTeamsByTournament] = useState<Record<string, TeamRow[]>>({});
  const [matchesByTournament, setMatchesByTournament] = useState<Record<string, MatchRow[]>>({});
  const [resultsByMatch, setResultsByMatch] = useState<Record<string, MatchResultRow>>({});
  const [profilesByUser, setProfilesByUser] = useState<Record<string, ProfileRow>>({});
  const [activeLinksByTournament, setActiveLinksByTournament] = useState<Record<string, LinkRow[]>>({});

  const [form, setForm] = useState<CreateTournamentForm>(defaultForm);
  const [creating, setCreating] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingImageForTournament, setUploadingImageForTournament] = useState<string | null>(null);
  const [generatingForTournament, setGeneratingForTournament] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<MatchEditorState | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoadingData(true);
    const { data: superAdmin } = await supabase
      .from("app_super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    setIsSystemAdmin(!!superAdmin);

    const [{ data: created }, { data: adminRows }] = await Promise.all([
      supabase.from("tournaments").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
      supabase.from("tournament_admins").select("tournament_id").eq("user_id", user.id),
    ]);

    const adminTournamentIds = (adminRows || []).map((row) => row.tournament_id);
    let adminTournaments: TournamentRow[] = [];
    if (adminTournamentIds.length > 0) {
      const { data } = await supabase.from("tournaments").select("*").in("id", adminTournamentIds);
      adminTournaments = data || [];
    }

    const merged = [...(created || []), ...adminTournaments];
    const unique = Array.from(new Map(merged.map((t) => [t.id, t])).values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setTournaments(unique);

    const tournamentIds = unique.map((t) => t.id);
    if (tournamentIds.length === 0) {
      setTeamsByTournament({});
      setMatchesByTournament({});
      setResultsByMatch({});
      setProfilesByUser({});
      setActiveLinksByTournament({});
      setLoadingData(false);
      return;
    }

    const [teamsRes, matchesRes, resultsRes, linksRes] = await Promise.all([
      supabase.from("tournament_teams").select("*").in("tournament_id", tournamentIds),
      supabase.from("tournament_matches").select("*").in("tournament_id", tournamentIds).order("created_at", { ascending: true }),
      supabase.from("tournament_match_results").select("*").in("tournament_id", tournamentIds),
      supabase
        .from("tournament_player_team_links")
        .select("*")
        .in("tournament_id", tournamentIds)
        .eq("status", "ATIVO"),
    ]);

    const teamMap: Record<string, TeamRow[]> = {};
    (teamsRes.data || []).forEach((team) => {
      if (!teamMap[team.tournament_id]) teamMap[team.tournament_id] = [];
      teamMap[team.tournament_id].push(team);
    });
    setTeamsByTournament(teamMap);

    const matchMap: Record<string, MatchRow[]> = {};
    (matchesRes.data || []).forEach((match) => {
      if (!matchMap[match.tournament_id]) matchMap[match.tournament_id] = [];
      matchMap[match.tournament_id].push(match);
    });
    setMatchesByTournament(matchMap);

    const resultMap: Record<string, MatchResultRow> = {};
    (resultsRes.data || []).forEach((result) => {
      resultMap[result.tournament_match_id] = result;
    });
    setResultsByMatch(resultMap);

    const linksMap: Record<string, LinkRow[]> = {};
    (linksRes.data || []).forEach((link) => {
      if (!linksMap[link.tournament_id]) linksMap[link.tournament_id] = [];
      linksMap[link.tournament_id].push(link);
    });
    setActiveLinksByTournament(linksMap);

    const userIds = new Set<string>();
    (linksRes.data || []).forEach((link) => userIds.add(link.user_id));
    (resultsRes.data || []).forEach((result) => {
      if (result.mvp_user_id) userIds.add(result.mvp_user_id);
    });

    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", Array.from(userIds));
      const profileMap: Record<string, ProfileRow> = {};
      (profiles || []).forEach((profile) => {
        profileMap[profile.user_id] = profile;
      });
      setProfilesByUser(profileMap);
    } else {
      setProfilesByUser({});
    }

    setLoadingData(false);
  }, [user]);

  useEffect(() => {
    if (user && profileChecked) {
      void loadData();
    }
  }, [user, profileChecked, loadData]);

  const createTournament = async () => {
    if (!user) return;
    if (!form.nome.trim()) {
      toast.error("Informe o nome do torneio");
      return;
    }

    const minPlayers = Number(form.minimoJogadores || "0");
    if (Number.isNaN(minPlayers) || minPlayers < 1) {
      toast.error("Mínimo de jogadores inválido");
      return;
    }

    if (form.limiteDeTimes) {
      const max = Number(form.quantidadeMaximaDeTimes || "0");
      if (Number.isNaN(max) || max < 2) {
        toast.error("Quantidade máxima de times deve ser no mínimo 2");
        return;
      }
    }

    setCreating(true);
    const tieBreakerCriteria = form.criteriosDesempate
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    const { error } = await supabase.from("tournaments").insert({
      name: form.nome.trim(),
      description: form.descricao.trim() || null,
      tournament_type: form.tipoTorneio,
      status: "DRAFT",
      has_team_limit: form.limiteDeTimes,
      max_teams: form.limiteDeTimes ? Number(form.quantidadeMaximaDeTimes) : null,
      is_official: form.torneioOficial,
      round_trip: form.idaEVolta,
      tie_breaker_criteria: tieBreakerCriteria,
      card_accumulation: form.acumulacaoCartoes,
      registration_min_players: minPlayers,
      created_by: user.id,
      updated_by: user.id,
    });

    setCreating(false);

    if (error) {
      toast.error(`Erro ao criar torneio: ${error.message}`);
      return;
    }

    toast.success("Torneio criado com sucesso");
    setForm(defaultForm);
    await loadData();
  };

  const changeTournamentStatus = async (tournament: TournamentRow, newStatus: TournamentStatus) => {
    try {
      assertCanTransitionTournamentStatus(tournament.status as TournamentStatus, newStatus);
    } catch {
      toast.error("Transição de estado inválida");
      return;
    }

    const { error } = await supabase
      .from("tournaments")
      .update({ status: newStatus, updated_by: user?.id || null })
      .eq("id", tournament.id);

    if (error) {
      toast.error(`Erro ao atualizar status: ${error.message}`);
      return;
    }

    toast.success("Status atualizado");
    await loadData();
  };

  const createDrawAndFixtures = async (tournament: TournamentRow) => {
    const teams = (teamsByTournament[tournament.id] || []).filter((team) => team.status === "INSCRITO");
    if (teams.length < 2) {
      toast.error("É necessário ter ao menos 2 times inscritos");
      return;
    }

    setGeneratingForTournament(tournament.id);

    const teamSeeds: TeamSeed[] = teams.map((team, idx) => ({
      teamId: team.id,
      nome: team.name,
      seed: idx + 1,
    }));

    const fixtures = generateTournamentFixtures({
      tournamentId: tournament.id,
      tipoTorneio: tournament.tournament_type as TournamentType,
      teams: teamSeeds,
      seedEnabled: true,
      groupCount: 4,
    });

    if (fixtures.length === 0) {
      setGeneratingForTournament(null);
      toast.error("Não foi possível gerar confrontos com os times atuais");
      return;
    }

    const { data: drawAudit, error: drawError } = await supabase
      .from("tournament_draw_audits")
      .insert({
        tournament_id: tournament.id,
        algorithm_used: tournament.tournament_type,
        draw_metadata: { generated_fixtures: fixtures.length },
        created_by: user?.id || "",
      })
      .select("id")
      .single();

    if (drawError || !drawAudit) {
      setGeneratingForTournament(null);
      toast.error(`Erro ao registrar sorteio: ${drawError?.message || "falha"}`);
      return;
    }

    const payload = fixtures.map((fx) => ({
      tournament_id: tournament.id,
      draw_audit_id: drawAudit.id,
      phase: fx.fase,
      round_number: fx.rodada || null,
      group_label: fx.grupo || null,
      home_team_id: fx.timeCasaId,
      away_team_id: fx.timeForaId,
      status: "AGENDADO" as const,
    }));

    const { error: matchError } = await supabase.from("tournament_matches").insert(payload);

    if (matchError) {
      setGeneratingForTournament(null);
      toast.error(`Erro ao salvar jogos: ${matchError.message}`);
      return;
    }

    await supabase
      .from("tournaments")
      .update({ status: "TABELA_GERADA", updated_by: user?.id || null })
      .eq("id", tournament.id);

    setGeneratingForTournament(null);
    toast.success(`Tabela gerada com ${fixtures.length} jogos`);
    await loadData();
  };

  const uploadTournamentImage = async (tournament: TournamentRow, file: File) => {
    if (!user) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    setUploadingImageForTournament(tournament.id);

    const { data: latestVersionRow } = await supabase
      .from("tournament_file_versions")
      .select("file_version")
      .eq("tournament_id", tournament.id)
      .eq("file_scope", "TOURNAMENT_IMAGE")
      .is("team_id", null)
      .order("file_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersionRow?.file_version || 0) + 1;
    const filePath = `tournaments/${tournament.id}/tournament/v${nextVersion}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("tournament-media")
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setUploadingImageForTournament(null);
      toast.error(`Falha no upload: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = supabase.storage.from("tournament-media").getPublicUrl(filePath);

    const [{ error: versionError }, { error: tournamentError }] = await Promise.all([
      supabase.from("tournament_file_versions").insert({
        tournament_id: tournament.id,
        file_scope: "TOURNAMENT_IMAGE",
        team_id: null,
        storage_path: filePath,
        file_version: nextVersion,
        uploaded_by: user.id,
      }),
      supabase
        .from("tournaments")
        .update({ image_url: urlData.publicUrl, image_version: nextVersion, updated_by: user.id })
        .eq("id", tournament.id),
    ]);

    setUploadingImageForTournament(null);

    if (versionError || tournamentError) {
      toast.error(`Erro ao salvar versão da imagem: ${versionError?.message || tournamentError?.message}`);
      return;
    }

    toast.success("Imagem do torneio atualizada com versionamento");
    await loadData();
  };

  const teamNameById = useCallback(
    (tournamentId: string, teamId: string | null) => {
      if (!teamId) return "-";
      return (teamsByTournament[tournamentId] || []).find((team) => team.id === teamId)?.name || "Time";
    },
    [teamsByTournament]
  );

  const openMatchEditor = (tournament: TournamentRow, match: MatchRow) => {
    const currentResult = resultsByMatch[match.id] || null;

    if (currentResult?.status === "VALIDADO") {
      toast.info("Jogo validado. Resultado bloqueado para edição.");
      return;
    }

    setEditorState({
      match,
      currentResult,
      homeScore: String(currentResult?.home_score ?? 0),
      awayScore: String(currentResult?.away_score ?? 0),
      status: currentResult?.status || "RASCUNHO",
      mvpUserId: currentResult?.mvp_user_id || "",
      goals: [],
      cards: [],
    });

    const tournamentLinks = activeLinksByTournament[tournament.id] || [];
    if (tournamentLinks.length === 0) {
      toast.info("Sem vínculos ativos de jogadores para preencher MVP/gols/cartões automaticamente");
    }
  };

  const playersForEditor = useMemo(() => {
    if (!editorState) return [];

    const tournamentId = editorState.match.tournament_id;
    const match = editorState.match;
    const links = activeLinksByTournament[tournamentId] || [];

    return links
      .filter((link) => {
        const teamId = link.tournament_team_id;
        return teamId === match.home_team_id || teamId === match.away_team_id;
      })
      .map((link) => ({
        userId: link.user_id,
        teamId: link.tournament_team_id,
        displayName: profilesByUser[link.user_id]?.display_name || "Jogador",
      }));
  }, [activeLinksByTournament, editorState, profilesByUser]);

  const saveMatchResult = async () => {
    if (!editorState || !user) return;

    const homeScore = Number(editorState.homeScore);
    const awayScore = Number(editorState.awayScore);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      toast.error("Placar inválido");
      return;
    }

    setSavingResult(true);

    const payload = {
      tournament_match_id: editorState.match.id,
      tournament_id: editorState.match.tournament_id,
      status: editorState.status,
      home_score: homeScore,
      away_score: awayScore,
      mvp_user_id: editorState.mvpUserId || null,
      validated_at: editorState.status === "VALIDADO" ? new Date().toISOString() : null,
      validated_by: editorState.status === "VALIDADO" ? user.id : null,
    };

    const { data: upserted, error: resultError } = await supabase
      .from("tournament_match_results")
      .upsert(payload, { onConflict: "tournament_match_id" })
      .select("id")
      .single();

    if (resultError || !upserted) {
      setSavingResult(false);
      toast.error(`Erro ao salvar resultado: ${resultError?.message || "falha"}`);
      return;
    }

    const resultId = upserted.id;

    await Promise.all([
      supabase.from("tournament_match_goals").delete().eq("tournament_match_result_id", resultId),
      supabase.from("tournament_match_cards").delete().eq("tournament_match_result_id", resultId),
    ]);

    if (editorState.goals.length > 0) {
      const goalsPayload = editorState.goals.map((goal) => ({
        tournament_match_result_id: resultId,
        tournament_id: editorState.match.tournament_id,
        match_id: editorState.match.id,
        player_user_id: goal.jogadorId,
        team_id: goal.timeId,
        assist_player_user_id: goal.assistenciaJogadorId || null,
      }));
      const { error } = await supabase.from("tournament_match_goals").insert(goalsPayload);
      if (error) {
        setSavingResult(false);
        toast.error(`Erro ao salvar gols: ${error.message}`);
        return;
      }
    }

    if (editorState.cards.length > 0) {
      const cardsPayload = editorState.cards.map((card) => ({
        tournament_match_result_id: resultId,
        tournament_id: editorState.match.tournament_id,
        match_id: editorState.match.id,
        player_user_id: card.jogadorId,
        card_type: card.tipo,
      }));
      const { error } = await supabase.from("tournament_match_cards").insert(cardsPayload);
      if (error) {
        setSavingResult(false);
        toast.error(`Erro ao salvar cartões: ${error.message}`);
        return;
      }
    }

    await supabase
      .from("tournament_matches")
      .update({ status: "FINALIZADO", updated_at: new Date().toISOString() })
      .eq("id", editorState.match.id);

    setSavingResult(false);
    setEditorState(null);
    toast.success(editorState.status === "VALIDADO" ? "Resultado validado" : "Resultado salvo em rascunho");
    await loadData();
  };

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasProfileName) return <Navigate to="/?complete-profile=1" replace />;

  if (loadingData) {
    return <PageState message="Carregando módulo de torneios..." />;
  }

  if (!isSystemAdmin && tournaments.length === 0) {
    return (
      <PageState
        title="Sem acesso"
        message="Você não possui privilégios de administração de torneio."
        details="Solicite inclusão em tournament_admins ou acesso de sistema."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="PAINEL DE TORNEIOS"
        subtitle="Criação, gestão de estados, tabela e resultados"
        backTo="/admin"
        actions={
          <Link to="/admin">
            <Button variant="outline" size="sm" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Sistema
            </Button>
          </Link>
        }
      />

      <PageContent className="max-w-6xl space-y-6">
        <PageSectionCard
          title="CRIAR TORNEIO"
          description="Somente admins podem alterar regras, estados, sorteio/tabela e resultados"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Tipo de torneio</Label>
              <Select
                value={form.tipoTorneio}
                onValueChange={(value) => setForm((prev) => ({ ...prev, tipoTorneio: value as TournamentType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LIGA">Liga</SelectItem>
                  <SelectItem value="MATA_MATA">Mata-mata</SelectItem>
                  <SelectItem value="GRUPOS_COM_MATA_MATA">Grupos + mata-mata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mínimo de jogadores por time</Label>
              <Input
                type="number"
                min={1}
                value={form.minimoJogadores}
                onChange={(e) => setForm((prev) => ({ ...prev, minimoJogadores: e.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Critérios de desempate (ordem por vírgula)</Label>
              <Input
                value={form.criteriosDesempate}
                onChange={(e) => setForm((prev) => ({ ...prev, criteriosDesempate: e.target.value }))}
                placeholder="PONTOS,SALDO_GOLS,GOLS_PRO,CONFRONTO_DIRETO"
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="limite-times"
                checked={form.limiteDeTimes}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, limiteDeTimes: !!checked }))}
              />
              <Label htmlFor="limite-times">Limite de times</Label>
            </div>

            <div className="space-y-2">
              <Label>Qtd máxima de times</Label>
              <Input
                type="number"
                min={2}
                disabled={!form.limiteDeTimes}
                value={form.quantidadeMaximaDeTimes}
                onChange={(e) => setForm((prev) => ({ ...prev, quantidadeMaximaDeTimes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="torneio-oficial"
                checked={form.torneioOficial}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, torneioOficial: !!checked }))}
              />
              <Label htmlFor="torneio-oficial">Torneio oficial</Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="ida-volta"
                checked={form.idaEVolta}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, idaEVolta: !!checked }))}
              />
              <Label htmlFor="ida-volta">Ida e volta</Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="cartoes"
                checked={form.acumulacaoCartoes}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, acumulacaoCartoes: !!checked }))}
              />
              <Label htmlFor="cartoes">Acumulação de cartões</Label>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={createTournament} disabled={creating} className="gap-2">
              <Trophy className="h-4 w-4" />
              {creating ? "Criando..." : "Criar torneio"}
            </Button>
          </div>
        </PageSectionCard>

        <PageSectionCard
          title="TORNEIOS"
          description="Estado, tabela automática, resultados e upload de imagem versionado"
        >
          <div className="space-y-4">
            {tournaments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum torneio encontrado.</p>}

            {tournaments.map((tournament) => {
              const teams = teamsByTournament[tournament.id] || [];
              const matches = matchesByTournament[tournament.id] || [];

              return (
                <div key={tournament.id} className="rounded-lg border border-border/50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-xl tracking-wide text-foreground">{tournament.name}</h3>
                        <Badge variant={statusVariant(tournament.status as TournamentStatus)}>
                          {statusLabel[tournament.status as TournamentStatus]}
                        </Badge>
                        {tournament.is_official ? <Badge variant="outline">Oficial</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{tournament.description || "Sem descrição"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Tipo: {tournament.tournament_type} • Times: {teams.length} • Jogos: {matches.length}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={tournament.status}
                        onValueChange={(value) => changeTournamentStatus(tournament, value as TournamentStatus)}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {orderedStatus.map((status) => (
                            <SelectItem
                              key={`${tournament.id}-${status}`}
                              value={status}
                              disabled={!canTransitionTournamentStatus(tournament.status as TournamentStatus, status)}
                            >
                              {statusLabel[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="secondary"
                        className="gap-2"
                        disabled={
                          tournament.status !== "INSCRICOES_ENCERRADAS" ||
                          generatingForTournament === tournament.id
                        }
                        onClick={() => createDrawAndFixtures(tournament)}
                      >
                        <Swords className="h-4 w-4" />
                        {generatingForTournament === tournament.id ? "Gerando..." : "Gerar tabela"}
                      </Button>

                      <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <ImagePlus className="h-4 w-4" />
                        {uploadingImageForTournament === tournament.id ? "Enviando..." : "Imagem"}
                        <input
                          className="hidden"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void uploadTournamentImage(tournament, file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </Label>
                    </div>
                  </div>

                  {tournament.image_url ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Upload className="h-3.5 w-3.5" />
                      imagem v{tournament.image_version}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {matches.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem jogos gerados.</p>
                    ) : (
                      matches.map((match) => {
                        const result = resultsByMatch[match.id];
                        const isLocked = result?.status === "VALIDADO";

                        return (
                          <div key={match.id} className="rounded-md border border-border/50 p-3">
                            <p className="text-xs text-muted-foreground">
                              {match.phase}
                              {match.group_label ? ` • ${match.group_label}` : ""}
                              {match.round_number ? ` • rodada ${match.round_number}` : ""}
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {teamNameById(tournament.id, match.home_team_id)} x {teamNameById(tournament.id, match.away_team_id)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Status jogo: {match.status}
                              {result ? ` • Resultado: ${result.status}` : ""}
                            </p>
                            {result ? (
                              <p className="text-xs text-muted-foreground">
                                Placar: {result.home_score} x {result.away_score}
                              </p>
                            ) : null}
                            <div className="mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                disabled={isLocked}
                                onClick={() => openMatchEditor(tournament, match)}
                              >
                                <PlayCircle className="h-4 w-4" />
                                {isLocked ? "Resultado validado" : "Lançar resultado"}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </PageSectionCard>
      </PageContent>

      <Dialog open={!!editorState} onOpenChange={(open) => !open && setEditorState(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lançamento de resultado</DialogTitle>
            <DialogDescription>
              Apenas resultado VALIDADO impacta estatísticas e rankings.
            </DialogDescription>
          </DialogHeader>

          {editorState ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placar casa</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editorState.homeScore}
                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, homeScore: e.target.value } : prev))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Placar fora</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editorState.awayScore}
                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, awayScore: e.target.value } : prev))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Status do resultado</Label>
                  <Select
                    value={editorState.status}
                    onValueChange={(value) =>
                      setEditorState((prev) => (prev ? { ...prev, status: value as "RASCUNHO" | "VALIDADO" } : prev))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                      <SelectItem value="VALIDADO">Validado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>MVP</Label>
                  <Select
                    value={editorState.mvpUserId || "none"}
                    onValueChange={(value) =>
                      setEditorState((prev) => (prev ? { ...prev, mvpUserId: value === "none" ? "" : value } : prev))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem MVP</SelectItem>
                      {playersForEditor.map((player) => (
                        <SelectItem key={`mvp-${player.userId}`} value={player.userId}>
                          {player.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border border-border/50 p-3">
                <p className="text-sm font-medium">Gols</p>
                <div className="mt-2 space-y-2">
                  {editorState.goals.map((goal, idx) => (
                    <div key={`goal-${idx}`} className="grid grid-cols-3 gap-2">
                      <Select
                        value={goal.jogadorId}
                        onValueChange={(value) =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.goals];
                            next[idx] = { ...next[idx], jogadorId: value };
                            return { ...prev, goals: next };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Jogador" />
                        </SelectTrigger>
                        <SelectContent>
                          {playersForEditor.map((player) => (
                            <SelectItem key={`goal-player-${player.userId}`} value={player.userId}>
                              {player.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={goal.timeId}
                        onValueChange={(value) =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.goals];
                            next[idx] = { ...next[idx], timeId: value };
                            return { ...prev, goals: next };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={editorState.match.home_team_id || "none-home"}>
                            {teamNameById(editorState.match.tournament_id, editorState.match.home_team_id)}
                          </SelectItem>
                          <SelectItem value={editorState.match.away_team_id || "none-away"}>
                            {teamNameById(editorState.match.tournament_id, editorState.match.away_team_id)}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="destructive"
                        onClick={() =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            return { ...prev, goals: prev.goals.filter((_, i) => i !== idx) };
                          })
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() =>
                    setEditorState((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        goals: [
                          ...prev.goals,
                          {
                            jogadorId: playersForEditor[0]?.userId || "",
                            timeId: playersForEditor[0]?.teamId || prev.match.home_team_id || "",
                          },
                        ],
                      };
                    })
                  }
                >
                  Adicionar gol
                </Button>
              </div>

              <div className="rounded-md border border-border/50 p-3">
                <p className="text-sm font-medium">Cartões</p>
                <div className="mt-2 space-y-2">
                  {editorState.cards.map((card, idx) => (
                    <div key={`card-${idx}`} className="grid grid-cols-3 gap-2">
                      <Select
                        value={card.jogadorId}
                        onValueChange={(value) =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.cards];
                            next[idx] = { ...next[idx], jogadorId: value };
                            return { ...prev, cards: next };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Jogador" />
                        </SelectTrigger>
                        <SelectContent>
                          {playersForEditor.map((player) => (
                            <SelectItem key={`card-player-${player.userId}`} value={player.userId}>
                              {player.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={card.tipo}
                        onValueChange={(value) =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.cards];
                            next[idx] = { ...next[idx], tipo: value as "AMARELO" | "VERMELHO" };
                            return { ...prev, cards: next };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AMARELO">Amarelo</SelectItem>
                          <SelectItem value="VERMELHO">Vermelho</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="destructive"
                        onClick={() =>
                          setEditorState((prev) => {
                            if (!prev) return prev;
                            return { ...prev, cards: prev.cards.filter((_, i) => i !== idx) };
                          })
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() =>
                    setEditorState((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        cards: [
                          ...prev.cards,
                          {
                            jogadorId: playersForEditor[0]?.userId || "",
                            tipo: "AMARELO",
                          },
                        ],
                      };
                    })
                  }
                >
                  Adicionar cartão
                </Button>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditorState(null)}>
                  Cancelar
                </Button>
                <Button className="gap-2" disabled={savingResult} onClick={saveMatchResult}>
                  <Save className="h-4 w-4" />
                  {savingResult ? "Salvando..." : "Salvar resultado"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTournament;
