import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRightLeft, Award, BarChart3, CalendarDays, CheckCircle2, ImagePlus, LayoutDashboard, PlayCircle, Plus, Save, Shield, Swords, Trophy, Upload, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/layout/AdminShell";
import { PageContent, PageSectionCard } from "@/components/layout/PageLayout";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import { PageState } from "@/components/layout/PageState";
import { TournamentCreateFormCard, type TournamentCreateFormValues } from "../components/admin/TournamentCreateFormCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type TournamentStatus,
  type TournamentType,
} from "@/modules/tournaments";

type TournamentRow = Tables<"tournaments"> & { group_stage_groups_count: number | null };
type TeamRow = Tables<"tournament_teams">;
type MatchRow = Tables<"tournament_matches">;
type MatchResultRow = Tables<"tournament_match_results">;
type LinkRow = Tables<"tournament_player_team_links">;
type ProfileRow = Tables<"user_profiles">;
type TransferEventRow = Tables<"tournament_transfer_events">;
type TeamPlayerRow = Tables<"tournament_team_players">;
type PlayerStatsRow = Tables<"tournament_player_stats">;
type AchievementRow = Tables<"tournament_achievements">;
type AchievementCatalogRow = Tables<"tournament_achievement_catalog">;
type RankingRow = Database["public"]["Views"]["v_tournament_rankings"]["Row"];

type TournamentMainTab =
  | "lista"
  | "detalhes"
  | "times"
  | "jogos"
  | "classificacao"
  | "transferencias"
  | "premiacao";

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

interface TransferDraftState {
  linkId: string;
  toTeamId: string;
  reason: string;
}

interface TeamRegistrationWizardState {
  open: boolean;
  step: 1 | 2 | 3;
  existingTeamId: string;
  newTeamName: string;
  inviteSearch: string;
  invites: Array<{ user_id: string; display_name: string; status: "PENDENTE" | "ACEITO" | "RECUSADO" }>;
}

interface ImagePreviewState {
  open: boolean;
  objectUrl: string;
  file: File | null;
  tournamentId: string;
  teamId: string | null;
  scope: "TOURNAMENT" | "TEAM";
}

const defaultForm: TournamentCreateFormValues = {
  nome: "",
  descricao: "",
  tipoTorneio: "LIGA",
  quantidadeGrupos: "4",
  limiteDeTimes: false,
  quantidadeMaximaDeTimes: "",
  torneioOficial: false,
  idaEVolta: false,
  acumulacaoCartoes: true,
  criteriosDesempate: ["PONTOS", "SALDO_GOLS", "GOLS_PRO"],
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
  const [transferEventsByTournament, setTransferEventsByTournament] = useState<Record<string, TransferEventRow[]>>({});
  const [memberByTournament, setMemberByTournament] = useState<Record<string, boolean>>({});
  const [transferDraftByTournament, setTransferDraftByTournament] = useState<Record<string, TransferDraftState>>({});
  const [runningTransferForTournament, setRunningTransferForTournament] = useState<string | null>(null);

  const [form, setForm] = useState<TournamentCreateFormValues>(defaultForm);
  const [creating, setCreating] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingImageForTournament, setUploadingImageForTournament] = useState<string | null>(null);
  const [generatingForTournament, setGeneratingForTournament] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<MatchEditorState | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [mainTab, setMainTab] = useState<TournamentMainTab>("lista");
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterScope, setFilterScope] = useState<"ativos" | "encerrados" | "todos">("ativos");
  const [loadingSelectedData, setLoadingSelectedData] = useState(false);
  const [selectedTeamPlayers, setSelectedTeamPlayers] = useState<TeamPlayerRow[]>([]);
  const [selectedStats, setSelectedStats] = useState<PlayerStatsRow[]>([]);
  const [selectedRankings, setSelectedRankings] = useState<RankingRow[]>([]);
  const [selectedAchievements, setSelectedAchievements] = useState<AchievementRow[]>([]);
  const [selectedAchievementCatalog, setSelectedAchievementCatalog] = useState<AchievementCatalogRow[]>([]);
  const [wizard, setWizard] = useState<TeamRegistrationWizardState>({
    open: false,
    step: 1,
    existingTeamId: "",
    newTeamName: "",
    inviteSearch: "",
    invites: [],
  });
  const [submittingWizard, setSubmittingWizard] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState>({
    open: false,
    objectUrl: "",
    file: null,
    tournamentId: "",
    teamId: null,
    scope: "TOURNAMENT",
  });

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoadingData(true);
    const { data: superAdmin } = await supabase
      .from("app_super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const hasSystemAdminRole = !!superAdmin;
    setIsSystemAdmin(hasSystemAdminRole);

    const [
      { data: allTournaments },
      { data: adminRows },
      { data: participantLinksRows },
      { data: ownedTeamsRows },
      { data: teamPlayersRows },
    ] = await Promise.all([
      supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
      supabase.from("tournament_admins").select("tournament_id").eq("user_id", user.id),
      supabase.from("tournament_player_team_links").select("tournament_id").eq("user_id", user.id),
      supabase.from("tournament_teams").select("tournament_id").eq("owner_user_id", user.id),
      supabase.from("tournament_team_players").select("tournament_id").eq("user_id", user.id),
    ]);

    const adminTournamentIds = new Set<string>([
      ...(allTournaments || []).filter((t) => t.created_by === user.id).map((t) => t.id),
      ...(adminRows || []).map((row) => row.tournament_id),
    ]);

    const participantTournamentIds = new Set<string>([
      ...(participantLinksRows || []).map((row) => row.tournament_id),
      ...(ownedTeamsRows || []).map((row) => row.tournament_id),
      ...(teamPlayersRows || []).map((row) => row.tournament_id),
    ]);

    const merged = ((allTournaments || []) as TournamentRow[]).filter((tournament) => {
      if (hasSystemAdminRole) return true;
      if (adminTournamentIds.has(tournament.id)) return true;
      if (participantTournamentIds.has(tournament.id)) return true;
      return tournament.status === "INSCRICOES_ABERTAS";
    });
    const unique = Array.from(new Map(merged.map((t) => [t.id, t])).values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const memberMap: Record<string, boolean> = {};
    unique.forEach((tournament) => {
      memberMap[tournament.id] = participantTournamentIds.has(tournament.id);
    });

    setMemberByTournament(memberMap);

    setTournaments(unique);

    const tournamentIds = unique.map((t) => t.id);
    if (tournamentIds.length === 0) {
      setTeamsByTournament({});
      setMatchesByTournament({});
      setResultsByMatch({});
      setProfilesByUser({});
      setActiveLinksByTournament({});
      setTransferEventsByTournament({});
      setLoadingData(false);
      return;
    }

    const memberVisibleTournamentIds = tournamentIds.filter((id) => memberMap[id]);

    const [teamsRes, matchesRes, resultsRes, linksRes, transfersRes] = await Promise.all([
      supabase.from("tournament_teams").select("*").in("tournament_id", tournamentIds),
      supabase.from("tournament_matches").select("*").in("tournament_id", tournamentIds).order("created_at", { ascending: true }),
      supabase.from("tournament_match_results").select("*").in("tournament_id", tournamentIds),
      memberVisibleTournamentIds.length > 0
        ? supabase
            .from("tournament_player_team_links")
            .select("*")
        .in("tournament_id", memberVisibleTournamentIds)
            .eq("status", "ATIVO")
        : Promise.resolve({ data: [] as LinkRow[] }),
      memberVisibleTournamentIds.length > 0
        ? supabase
            .from("tournament_transfer_events")
            .select("*")
        .in("tournament_id", memberVisibleTournamentIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as TransferEventRow[] }),
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

    const transferMap: Record<string, TransferEventRow[]> = {};
    (transfersRes.data || []).forEach((event) => {
      if (!transferMap[event.tournament_id]) transferMap[event.tournament_id] = [];
      transferMap[event.tournament_id].push(event);
    });
    setTransferEventsByTournament(transferMap);

    const userIds = new Set<string>();
    (linksRes.data || []).forEach((link) => userIds.add(link.user_id));
    (resultsRes.data || []).forEach((result) => {
      if (result.mvp_user_id) userIds.add(result.mvp_user_id);
    });
    (transfersRes.data || []).forEach((event) => {
      userIds.add(event.user_id);
      userIds.add(event.created_by);
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

  useEffect(() => {
    if (!selectedTournamentId && tournaments.length > 0) {
      setSelectedTournamentId(tournaments[0].id);
    }
  }, [selectedTournamentId, tournaments]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((tournament) => {
      if (filterStatus !== "todos" && tournament.status !== filterStatus) return false;
      if (filterType !== "todos" && tournament.tournament_type !== filterType) return false;
      const isClosed = tournament.status === "FINALIZADO" || tournament.status === "ARQUIVADO";
      if (filterScope === "ativos" && isClosed) return false;
      if (filterScope === "encerrados" && !isClosed) return false;
      return true;
    });
  }, [filterScope, filterStatus, filterType, tournaments]);

  const selectedTournament = useMemo(() => {
    return tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;
  }, [selectedTournamentId, tournaments]);

  useEffect(() => {
    if (!selectedTournamentId) return;

    const loadSelected = async () => {
      setLoadingSelectedData(true);
      const [teamPlayersRes, statsRes, rankingsRes, achievementsRes, catalogRes] = await Promise.all([
        supabase.from("tournament_team_players").select("*").eq("tournament_id", selectedTournamentId),
        supabase.from("tournament_player_stats").select("*").eq("tournament_id", selectedTournamentId),
        supabase.from("v_tournament_rankings").select("*").eq("tournament_id", selectedTournamentId),
        supabase.from("tournament_achievements").select("*").eq("tournament_id", selectedTournamentId),
        supabase.from("tournament_achievement_catalog").select("*").eq("tournament_id", selectedTournamentId),
      ]);

      setSelectedTeamPlayers((teamPlayersRes.data || []) as TeamPlayerRow[]);
      setSelectedStats((statsRes.data || []) as PlayerStatsRow[]);
      setSelectedRankings((rankingsRes.data || []) as RankingRow[]);
      setSelectedAchievements((achievementsRes.data || []) as AchievementRow[]);
      setSelectedAchievementCatalog((catalogRes.data || []) as AchievementCatalogRow[]);
      setLoadingSelectedData(false);
    };

    void loadSelected();
  }, [selectedTournamentId]);

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

    const groupsCount = Number(form.quantidadeGrupos || "0");
    if (form.tipoTorneio === "GRUPOS_COM_MATA_MATA") {
      if (Number.isNaN(groupsCount) || groupsCount < 2) {
        toast.error("Quantidade de grupos deve ser no mínimo 2");
        return;
      }
    }

    if (form.limiteDeTimes) {
      const max = Number(form.quantidadeMaximaDeTimes || "0");
      if (Number.isNaN(max) || max < 2) {
        toast.error("Quantidade máxima de times deve ser no mínimo 2");
        return;
      }
    }

    setCreating(true);
    if (form.criteriosDesempate.length === 0) {
      toast.error("Selecione ao menos 1 critério de desempate");
      setCreating(false);
      return;
    }

    const tieBreakerCriteria = form.criteriosDesempate;

    const { error } = await supabase.from("tournaments").insert({
      name: form.nome.trim(),
      description: form.descricao.trim() || null,
      tournament_type: form.tipoTorneio,
      status: "DRAFT",
      has_team_limit: form.limiteDeTimes,
      max_teams: form.limiteDeTimes ? Number(form.quantidadeMaximaDeTimes) : null,
      is_official: form.torneioOficial,
      round_trip: form.idaEVolta,
      group_stage_groups_count: form.tipoTorneio === "GRUPOS_COM_MATA_MATA" ? groupsCount : null,
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
    setCreateTournamentOpen(false);
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
      groupCount: tournament.group_stage_groups_count || 4,
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

  const uploadTeamImage = async (tournament: TournamentRow, team: TeamRow, file: File) => {
    if (!user) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    setUploadingImageForTournament(tournament.id);

    const { data: latestVersionRow } = await supabase
      .from("tournament_file_versions")
      .select("file_version")
      .eq("tournament_id", tournament.id)
      .eq("file_scope", "TEAM_IMAGE")
      .eq("team_id", team.id)
      .order("file_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersionRow?.file_version || 0) + 1;
    const filePath = `tournaments/${tournament.id}/teams/${team.id}/v${nextVersion}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("tournament-media")
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setUploadingImageForTournament(null);
      toast.error(`Falha no upload do escudo: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = supabase.storage.from("tournament-media").getPublicUrl(filePath);

    const [{ error: versionError }, { error: teamError }] = await Promise.all([
      supabase.from("tournament_file_versions").insert({
        tournament_id: tournament.id,
        file_scope: "TEAM_IMAGE",
        team_id: team.id,
        storage_path: filePath,
        file_version: nextVersion,
        uploaded_by: user.id,
      }),
      supabase
        .from("tournament_teams")
        .update({ image_url: urlData.publicUrl, image_version: nextVersion })
        .eq("id", team.id),
    ]);

    setUploadingImageForTournament(null);

    if (versionError || teamError) {
      toast.error(`Erro ao salvar versão do escudo: ${versionError?.message || teamError?.message}`);
      return;
    }

    toast.success("Escudo do time atualizado");
    await loadData();
  };

  const validateImageFile = (file: File): string | null => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) return "Formato inválido. Use PNG, JPG ou WEBP.";
    const maxBytes = 3 * 1024 * 1024;
    if (file.size > maxBytes) return "Arquivo maior que 3MB.";
    return null;
  };

  const openImagePreview = (
    file: File,
    scope: "TOURNAMENT" | "TEAM",
    tournamentId: string,
    teamId: string | null = null
  ) => {
    const validation = validateImageFile(file);
    if (validation) {
      toast.error(validation);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImagePreview({
      open: true,
      objectUrl,
      file,
      scope,
      tournamentId,
      teamId,
    });
  };

  const closeImagePreview = () => {
    if (imagePreview.objectUrl) URL.revokeObjectURL(imagePreview.objectUrl);
    setImagePreview({
      open: false,
      objectUrl: "",
      file: null,
      tournamentId: "",
      teamId: null,
      scope: "TOURNAMENT",
    });
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

  const isTournamentMember = useCallback(
    (tournamentId: string) => {
      return !!memberByTournament[tournamentId];
    },
    [memberByTournament]
  );

  const isTransferWindowOpen = useCallback((tournament: TournamentRow) => {
    const now = Date.now();
    const startsAt = tournament.transfer_window_starts_at ? new Date(tournament.transfer_window_starts_at).getTime() : null;
    const endsAt = tournament.transfer_window_ends_at ? new Date(tournament.transfer_window_ends_at).getTime() : null;
    const closedAt = tournament.transfer_window_closed_at ? new Date(tournament.transfer_window_closed_at).getTime() : null;

    if (closedAt) return false;
    if (startsAt && now < startsAt) return false;
    if (endsAt && now > endsAt) return false;

    return ["INSCRICOES_ABERTAS", "INSCRICOES_ENCERRADAS", "TABELA_GERADA"].includes(tournament.status);
  }, []);

  const executeTransfer = async (tournament: TournamentRow) => {
    if (!user) return;
    if (!isTournamentMember(tournament.id)) {
      toast.error("Sem permissão para realizar transferências");
      return;
    }

    const draft = transferDraftByTournament[tournament.id];
    if (!draft?.linkId || !draft?.toTeamId) {
      toast.error("Selecione jogador e time de destino");
      return;
    }

    const sourceLink = (activeLinksByTournament[tournament.id] || []).find((item) => item.id === draft.linkId);
    if (!sourceLink) {
      toast.error("Vínculo de jogador não encontrado");
      return;
    }

    if (sourceLink.tournament_team_id === draft.toTeamId) {
      toast.error("O jogador já está no time selecionado");
      return;
    }

    setRunningTransferForTournament(tournament.id);

    const nowIso = new Date().toISOString();

    const { error: removeError } = await supabase
      .from("tournament_player_team_links")
      .update({ status: "SUBSTITUIDO", ended_at: nowIso })
      .eq("id", sourceLink.id)
      .eq("status", "ATIVO");

    if (removeError) {
      setRunningTransferForTournament(null);
      toast.error(`Erro ao remover vínculo antigo: ${removeError.message}`);
      return;
    }

    const { data: newLink, error: createError } = await supabase
      .from("tournament_player_team_links")
      .insert({
        tournament_id: tournament.id,
        tournament_team_id: draft.toTeamId,
        user_id: sourceLink.user_id,
        status: "ATIVO",
        origin: "TRANSFERENCIA_INTERNA",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (createError || !newLink) {
      await supabase
        .from("tournament_player_team_links")
        .update({ status: "ATIVO", ended_at: null, replaced_by_link_id: null })
        .eq("id", sourceLink.id);

      setRunningTransferForTournament(null);
      toast.error(`Erro ao criar novo vínculo: ${createError?.message || "falha"}`);
      return;
    }

    await supabase
      .from("tournament_player_team_links")
      .update({ replaced_by_link_id: newLink.id })
      .eq("id", sourceLink.id);

    const { error: transferEventError } = await supabase.from("tournament_transfer_events").insert({
      tournament_id: tournament.id,
      user_id: sourceLink.user_id,
      from_team_id: sourceLink.tournament_team_id,
      to_team_id: draft.toTeamId,
      source_type: "TRANSFERENCIA",
      reason: draft.reason?.trim() || null,
      created_by: user.id,
    });

    setRunningTransferForTournament(null);

    if (transferEventError) {
      toast.error(`Transferência aplicada, mas evento não foi registrado: ${transferEventError.message}`);
    } else {
      toast.success("Transferência concluída com sucesso");
    }

    setTransferDraftByTournament((prev) => ({
      ...prev,
      [tournament.id]: { linkId: "", toTeamId: "", reason: "" },
    }));
    await loadData();
  };

  const addInviteToWizard = async () => {
    if (!wizard.inviteSearch.trim()) return;
    const search = wizard.inviteSearch.trim();

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id,display_name")
      .ilike("display_name", `%${search}%`)
      .maybeSingle();

    if (!profile) {
      toast.error("Jogador não encontrado pelo nome informado");
      return;
    }

    if (wizard.invites.some((invite) => invite.user_id === profile.user_id)) {
      toast.error("Jogador já adicionado no convite");
      return;
    }

    setWizard((prev) => ({
      ...prev,
      inviteSearch: "",
      invites: [
        ...prev.invites,
        { user_id: profile.user_id, display_name: profile.display_name, status: "PENDENTE" },
      ],
    }));
  };

  const submitTeamRegistrationWizard = async () => {
    if (!user || !selectedTournament) return;
    if (selectedTournament.status !== "INSCRICOES_ABERTAS") {
      toast.error("Inscrições não estão abertas");
      return;
    }

    if (!wizard.existingTeamId && !wizard.newTeamName.trim()) {
      toast.error("Selecione um time existente ou informe um novo time");
      return;
    }

    setSubmittingWizard(true);

    let teamId = wizard.existingTeamId;
    if (!teamId) {
      const { data: createdTeam, error: createTeamError } = await supabase
        .from("tournament_teams")
        .insert({
          tournament_id: selectedTournament.id,
          owner_user_id: user.id,
          name: wizard.newTeamName.trim(),
          min_players_required: selectedTournament.registration_min_players,
          status: "PENDENTE",
        })
        .select("id")
        .single();

      if (createTeamError || !createdTeam) {
        setSubmittingWizard(false);
        toast.error(`Erro ao criar time: ${createTeamError?.message || "falha"}`);
        return;
      }

      teamId = createdTeam.id;
    }

    if (wizard.invites.length > 0) {
      const payload = wizard.invites.map((invite) => ({
        tournament_team_id: teamId,
        tournament_id: selectedTournament.id,
        user_id: invite.user_id,
        invited_by: user.id,
        invite_status: "PENDENTE" as const,
      }));

      const { error: inviteError } = await supabase.from("tournament_team_players").insert(payload);
      if (inviteError) {
        setSubmittingWizard(false);
        toast.error(`Erro ao enviar convites: ${inviteError.message}`);
        return;
      }
    }

    setSubmittingWizard(false);
    setWizard({
      open: false,
      step: 1,
      existingTeamId: "",
      newTeamName: "",
      inviteSearch: "",
      invites: [],
    });

    toast.success("Inscrição enviada com sucesso. O time só confirma após todos aceitarem.");
    await loadData();
  };

  const selectedTeams = useMemo(
    () => (selectedTournament ? teamsByTournament[selectedTournament.id] || [] : []),
    [selectedTournament, teamsByTournament]
  );
  const selectedMatches = useMemo(
    () => (selectedTournament ? matchesByTournament[selectedTournament.id] || [] : []),
    [matchesByTournament, selectedTournament]
  );
  const selectedLinks = useMemo(
    () => (selectedTournament ? activeLinksByTournament[selectedTournament.id] || [] : []),
    [activeLinksByTournament, selectedTournament]
  );
  const selectedTransferEvents = useMemo(
    () => (selectedTournament ? transferEventsByTournament[selectedTournament.id] || [] : []),
    [selectedTournament, transferEventsByTournament]
  );
  const selectedTransferDraft = selectedTournament
    ? transferDraftByTournament[selectedTournament.id] || { linkId: "", toTeamId: "", reason: "" }
    : { linkId: "", toTeamId: "", reason: "" };

  const freePlayers = useMemo(() => {
    if (!selectedTournament) return [] as TeamPlayerRow[];
    const linkedUsers = new Set(selectedLinks.map((link) => link.user_id));
    return selectedTeamPlayers.filter((player) => player.invite_status === "ACEITO" && !linkedUsers.has(player.user_id));
  }, [selectedLinks, selectedTeamPlayers, selectedTournament]);

  const transferCandidates = useMemo(() => {
    return selectedLinks.map((link) => ({
      link,
      name: profilesByUser[link.user_id]?.display_name || "Jogador",
    }));
  }, [profilesByUser, selectedLinks]);

  if (loading || !profileChecked) return <PageLoadingState />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasProfileName) return <Navigate to="/?complete-profile=1" replace />;

  if (loadingData) {
    return <PageLoadingState />;
  }

  return (
    <>
      <Dialog open={createTournamentOpen} onOpenChange={setCreateTournamentOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Criar novo torneio</DialogTitle>
            <DialogDescription>
              Defina regras e parâmetros iniciais. Você poderá ajustar detalhes depois.
            </DialogDescription>
          </DialogHeader>
          <TournamentCreateFormCard
            form={form}
            creating={creating}
            setForm={setForm}
            onCreate={createTournament}
          />
        </DialogContent>
      </Dialog>

      <AdminShell
      title="PAINEL DE TORNEIOS"
      subtitle="Inscrição de membros, gestão de estados, tabela e resultados"
      backTo={isSystemAdmin ? "/admin" : "/"}
      navItems={[
        { label: "Dashboard", to: "/", icon: LayoutDashboard },
        ...(isSystemAdmin ? [{ label: "Sistema", to: "/admin", icon: Shield }] : []),
        { label: "Torneios", to: "/admin/torneios", icon: Trophy },
      ]}
      actions={
        isSystemAdmin ? (
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => setCreateTournamentOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo torneio
            </Button>
            <Link to="/admin">
              <Button variant="outline" size="sm" className="gap-2">
                <Shield className="h-4 w-4" />
                Sistema
              </Button>
            </Link>
          </div>
        ) : undefined
      }
      >
        <PageContent className="max-w-6xl space-y-6">
        <PageSectionCard
          title="TORNEIOS"
          description="Lista, detalhes, times, jogos, classificação, transferências e premiação"
        >
          <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as TournamentMainTab)}>
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex h-auto min-w-max gap-1 rounded-lg p-1">
                <TabsTrigger className="whitespace-nowrap" value="lista">Lista de Torneios</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="detalhes">Detalhes do Torneio</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="times">Times</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="jogos">Jogos</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="classificacao">Classificação / Estatísticas</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="transferencias">Transferências</TabsTrigger>
                <TabsTrigger className="whitespace-nowrap" value="premiacao">Premiação</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="lista" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {orderedStatus.map((status) => (
                        <SelectItem key={`filter-${status}`} value={status}>{statusLabel[status]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="LIGA">Liga</SelectItem>
                      <SelectItem value="MATA_MATA">Mata-mata</SelectItem>
                      <SelectItem value="GRUPOS_COM_MATA_MATA">Grupos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Escopo</Label>
                  <Select value={filterScope} onValueChange={(value) => setFilterScope(value as "ativos" | "encerrados" | "todos") }>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="encerrados">Encerrados</SelectItem>
                      <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredTournaments.length === 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
                  Nenhum torneio encontrado com os filtros atuais.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredTournaments.map((tournament) => {
                    const teamsCount = (teamsByTournament[tournament.id] || []).length;
                    const canOperate = isTournamentMember(tournament.id);
                    const canRegister = tournament.status === "INSCRICOES_ABERTAS";
                    return (
                      <div key={tournament.id} className="rounded-lg border border-border/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{tournament.name}</p>
                            <p className="text-xs text-muted-foreground">{tournament.description || "Sem descrição"}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Tipo: {tournament.tournament_type} • Times: {teamsCount}/{tournament.max_teams || "∞"}
                            </p>
                          </div>
                          <Badge variant={statusVariant(tournament.status as TournamentStatus)}>
                            {statusLabel[tournament.status as TournamentStatus]}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedTournamentId(tournament.id);
                              setMainTab("detalhes");
                            }}
                          >
                            Ver torneio
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canRegister}
                            onClick={() => {
                              setSelectedTournamentId(tournament.id);
                              setWizard((prev) => ({ ...prev, open: true, step: 1 }));
                            }}
                          >
                            Inscrever time
                          </Button>
                          {canOperate && <Badge variant="outline">Membro</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="detalhes" className="space-y-4">
              {!selectedTournament ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Selecione um torneio na lista.</div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-border/50">
                    <div className="h-40 bg-muted">
                      {selectedTournament.image_url ? (
                        <img src={selectedTournament.image_url} alt="Banner" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem imagem do torneio</div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold text-foreground">{selectedTournament.name}</h3>
                        <Badge variant={statusVariant(selectedTournament.status as TournamentStatus)}>
                          {statusLabel[selectedTournament.status as TournamentStatus]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedTournament.description || "Sem descrição"}</p>
                      <p className="text-xs text-muted-foreground">
                        Tipo: {selectedTournament.tournament_type} • Vagas restantes: {Math.max((selectedTournament.max_teams || 9999) - selectedTeams.length, 0)}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled={!isTournamentMember(selectedTournament.id)}>
                                Editar torneio
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!isTournamentMember(selectedTournament.id) && <TooltipContent>Somente membros podem editar.</TooltipContent>}
                        </Tooltip>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isTournamentMember(selectedTournament.id)}
                          onClick={() =>
                            changeTournamentStatus(
                              selectedTournament,
                              selectedTournament.status === "INSCRICOES_ABERTAS" ? "INSCRICOES_ENCERRADAS" : "INSCRICOES_ABERTAS"
                            )
                          }
                        >
                          {selectedTournament.status === "INSCRICOES_ABERTAS" ? "Fechar inscrições" : "Abrir inscrições"}
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!isTournamentMember(selectedTournament.id) || generatingForTournament === selectedTournament.id}
                          onClick={() => createDrawAndFixtures(selectedTournament)}
                        >
                          Gerar tabela
                        </Button>

                        <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <ImagePlus className="h-4 w-4" />
                          Imagem
                          <input
                            className="hidden"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={!isTournamentMember(selectedTournament.id)}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file || !isTournamentMember(selectedTournament.id)) return;
                              openImagePreview(file, "TOURNAMENT", selectedTournament.id);
                              e.currentTarget.value = "";
                            }}
                          />
                        </Label>

                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!isTournamentMember(selectedTournament.id)}
                          onClick={() => changeTournamentStatus(selectedTournament, "FINALIZADO")}
                        >
                          Encerrar torneio
                        </Button>

                        <Button
                          size="sm"
                          disabled={selectedTournament.status !== "INSCRICOES_ABERTAS"}
                          onClick={() => setWizard((prev) => ({ ...prev, open: true, step: 1 }))}
                        >
                          Inscrever time
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="times" className="space-y-4">
              {!selectedTournament ? (
                <p className="text-sm text-muted-foreground">Selecione um torneio na lista.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedTeams.length === 0 ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Nenhum time inscrito.</div>
                  ) : (
                    selectedTeams.map((team) => {
                      const roster = selectedLinks.filter((link) => link.tournament_team_id === team.id);
                      return (
                        <div key={team.id} className="rounded-md border border-border/50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-foreground">{team.name}</p>
                            <Badge variant="outline">{team.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Jogadores ativos: {roster.length}</p>
                          <div className="mt-2 space-y-1">
                            {roster.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sem elenco ativo.</p>
                            ) : (
                              roster.map((link) => (
                                <div key={link.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-xs">
                                  <span>{profilesByUser[link.user_id]?.display_name || "Jogador"}</span>
                                  <span className="text-muted-foreground">{link.origin}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" disabled={!isTransferWindowOpen(selectedTournament)}>Adicionar jogador</Button>
                            <Button size="sm" variant="outline" disabled={!isTransferWindowOpen(selectedTournament)}>Substituir jogador</Button>
                            <Label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input px-2 py-1 text-xs">
                              <Upload className="h-3.5 w-3.5" /> Escudo
                              <input
                                className="hidden"
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={!isTournamentMember(selectedTournament.id)}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  openImagePreview(file, "TEAM", selectedTournament.id, team.id);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </Label>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="jogos" className="space-y-3">
              {!selectedTournament ? (
                <p className="text-sm text-muted-foreground">Selecione um torneio na lista.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedMatches.length === 0 ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Sem jogos cadastrados.</div>
                  ) : (
                    selectedMatches.map((match) => {
                      const result = resultsByMatch[match.id];
                      const isLocked = result?.status === "VALIDADO";
                      return (
                        <div key={match.id} className="rounded-md border border-border/50 p-3">
                          <p className="text-xs text-muted-foreground">
                            <CalendarDays className="mr-1 inline h-3 w-3" />
                            {match.phase}{match.group_label ? ` • ${match.group_label}` : ""}
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {teamNameById(selectedTournament.id, match.home_team_id)} x {teamNameById(selectedTournament.id, match.away_team_id)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Status: {match.status} {result ? `• ${result.home_score} x ${result.away_score}` : ""}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isTournamentMember(selectedTournament.id)}
                              onClick={() => openMatchEditor(selectedTournament, match)}
                            >
                              <PlayCircle className="mr-1 h-3.5 w-3.5" />
                              Lançar resultado
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isTournamentMember(selectedTournament.id) || isLocked}
                              onClick={() => openMatchEditor(selectedTournament, match)}
                            >
                              Editar resultado
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="classificacao" className="space-y-3">
              {loadingSelectedData ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !selectedTournament ? (
                <p className="text-sm text-muted-foreground">Selecione um torneio na lista.</p>
              ) : (
                <>
                  <div className="rounded-md border border-border/50 p-3">
                    <p className="mb-2 text-sm font-semibold text-foreground"><BarChart3 className="mr-1 inline h-4 w-4" /> Classificação</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-1">Jogador</th>
                            <th className="py-1">Jogos</th>
                            <th className="py-1">Gols</th>
                            <th className="py-1">Assist.</th>
                            <th className="py-1">Fair Play</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStats.slice().sort((a, b) => b.goals - a.goals).map((row) => (
                            <tr key={row.player_user_id} className="border-t border-border/40">
                              <td className="py-1">{profilesByUser[row.player_user_id]?.display_name || "Jogador"}</td>
                              <td className="py-1">{row.matches_played}</td>
                              <td className="py-1">{row.goals}</td>
                              <td className="py-1">{row.assists}</td>
                              <td className="py-1">{row.fair_play_points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-md border border-border/50 p-3 text-xs">
                      <p className="font-medium text-foreground">Artilharia</p>
                      {selectedRankings.slice().sort((a, b) => (a.artillery_rank || 999) - (b.artillery_rank || 999)).slice(0, 5).map((row) => (
                        <p key={`g-${row.player_user_id}`} className="text-muted-foreground">#{row.artillery_rank} {profilesByUser[row.player_user_id]?.display_name || "Jogador"}</p>
                      ))}
                    </div>
                    <div className="rounded-md border border-border/50 p-3 text-xs">
                      <p className="font-medium text-foreground">Assistências</p>
                      {selectedRankings.slice().sort((a, b) => (a.assists_rank || 999) - (b.assists_rank || 999)).slice(0, 5).map((row) => (
                        <p key={`a-${row.player_user_id}`} className="text-muted-foreground">#{row.assists_rank} {profilesByUser[row.player_user_id]?.display_name || "Jogador"}</p>
                      ))}
                    </div>
                    <div className="rounded-md border border-border/50 p-3 text-xs">
                      <p className="font-medium text-foreground">Fair Play</p>
                      {selectedRankings.slice().sort((a, b) => (a.fair_play_rank || 999) - (b.fair_play_rank || 999)).slice(0, 5).map((row) => (
                        <p key={`f-${row.player_user_id}`} className="text-muted-foreground">#{row.fair_play_rank} {profilesByUser[row.player_user_id]?.display_name || "Jogador"}</p>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="transferencias" className="space-y-3">
              {!selectedTournament ? (
                <p className="text-sm text-muted-foreground">Selecione um torneio na lista.</p>
              ) : (
                <>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    Janela de transferências: {isTransferWindowOpen(selectedTournament) ? "aberta" : "fechada"}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border/50 p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">Jogadores Livres</p>
                      {freePlayers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum jogador livre no momento.</p>
                      ) : (
                        freePlayers.map((player) => (
                          <div key={player.id} className="mb-1 flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-xs">
                            <span>{profilesByUser[player.user_id]?.display_name || "Jogador"}</span>
                            <Button size="sm" variant="outline" disabled={!isTournamentMember(selectedTournament.id)}>Adicionar ao time</Button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="rounded-md border border-border/50 p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">Jogadores disponíveis para Transferência</p>
                      {transferCandidates.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum jogador disponível.</p>
                      ) : (
                        transferCandidates.map(({ link, name }) => (
                          <div key={link.id} className="mb-1 flex items-center justify-between rounded bg-muted/20 px-2 py-1 text-xs">
                            <span>{name} • {teamNameById(selectedTournament.id, link.tournament_team_id)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isTournamentMember(selectedTournament.id)}
                              onClick={() =>
                                setTransferDraftByTournament((prev) => ({
                                  ...prev,
                                  [selectedTournament.id]: { ...selectedTransferDraft, linkId: link.id },
                                }))
                              }
                            >
                              Selecionar
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {isTournamentMember(selectedTournament.id) && (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Jogador (vínculo atual)</Label>
                          <Select
                            value={selectedTransferDraft.linkId || "none"}
                            onValueChange={(value) =>
                              setTransferDraftByTournament((prev) => ({
                                ...prev,
                                [selectedTournament.id]: {
                                  ...selectedTransferDraft,
                                  linkId: value === "none" ? "" : value,
                                },
                              }))
                            }
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {selectedLinks.map((link) => (
                                <SelectItem key={link.id} value={link.id}>
                                  {(profilesByUser[link.user_id]?.display_name || "Jogador")} • {teamNameById(selectedTournament.id, link.tournament_team_id)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Time de destino</Label>
                          <Select
                            value={selectedTransferDraft.toTeamId || "none"}
                            onValueChange={(value) =>
                              setTransferDraftByTournament((prev) => ({
                                ...prev,
                                [selectedTournament.id]: {
                                  ...selectedTransferDraft,
                                  toTeamId: value === "none" ? "" : value,
                                },
                              }))
                            }
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {selectedTeams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Motivo</Label>
                          <Input
                            value={selectedTransferDraft.reason}
                            onChange={(e) =>
                              setTransferDraftByTournament((prev) => ({
                                ...prev,
                                [selectedTournament.id]: { ...selectedTransferDraft, reason: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          className="gap-2"
                          disabled={!isTransferWindowOpen(selectedTournament) || runningTransferForTournament === selectedTournament.id}
                          onClick={() => executeTransfer(selectedTournament)}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          {runningTransferForTournament === selectedTournament.id ? "Transferindo..." : "Executar transferência"}
                        </Button>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico de transferências</p>
                    {selectedTransferEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma transferência registrada.</p>
                    ) : (
                      selectedTransferEvents.slice(0, 20).map((event) => (
                        <div key={event.id} className="rounded-md border border-border/50 p-2 text-xs">
                          <p className="text-foreground">
                            {(profilesByUser[event.user_id]?.display_name || "Jogador")} • {teamNameById(selectedTournament.id, event.from_team_id)} → {teamNameById(selectedTournament.id, event.to_team_id)}
                          </p>
                          <p className="text-muted-foreground">{event.reason || "Sem motivo"} • {new Date(event.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="premiacao" className="space-y-3">
              {!selectedTournament ? (
                <p className="text-sm text-muted-foreground">Selecione um torneio na lista.</p>
              ) : loadingSelectedData ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedAchievements.length === 0 ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Nenhuma premiação registrada.</div>
                  ) : (
                    selectedAchievements.map((achievement) => {
                      const catalog = selectedAchievementCatalog.find((item) => item.id === achievement.achievement_catalog_id);
                      return (
                        <div key={achievement.id} className="rounded-md border border-border/50 p-3">
                          <p className="font-medium text-foreground"><Award className="mr-1 inline h-4 w-4" /> {catalog?.title || achievement.achievement_type}</p>
                          <p className="text-xs text-muted-foreground">{catalog?.description || "Sem descrição"}</p>
                          <p className="text-xs text-muted-foreground">Vencedor: {profilesByUser[achievement.user_id]?.display_name || "Jogador/Time"}</p>
                          <Button size="sm" variant="outline" className="mt-2">Ver no perfil</Button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </PageSectionCard>
        </PageContent>
      </AdminShell>

      <Dialog open={imagePreview.open} onOpenChange={(open) => !open && closeImagePreview()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Pré-visualização da imagem</DialogTitle>
            <DialogDescription>Confirme a imagem antes de salvar no torneio.</DialogDescription>
          </DialogHeader>

          {imagePreview.objectUrl ? (
            <div className="overflow-hidden rounded-md border border-border/60">
              <img src={imagePreview.objectUrl} alt="Pré-visualização" className="max-h-72 w-full object-cover" />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeImagePreview}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!imagePreview.file || !imagePreview.tournamentId) return;
                const tournament = tournaments.find((t) => t.id === imagePreview.tournamentId);
                if (!tournament) {
                  toast.error("Torneio não encontrado para upload");
                  return;
                }

                if (imagePreview.scope === "TOURNAMENT") {
                  await uploadTournamentImage(tournament, imagePreview.file);
                } else if (imagePreview.teamId) {
                  const team = (teamsByTournament[tournament.id] || []).find((item) => item.id === imagePreview.teamId);
                  if (!team) {
                    toast.error("Time não encontrado para upload");
                    return;
                  }
                  await uploadTeamImage(tournament, team, imagePreview.file);
                }

                closeImagePreview();
              }}
            >
              Salvar imagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wizard.open} onOpenChange={(open) => setWizard((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inscrição de Time</DialogTitle>
            <DialogDescription>
              Fluxo em etapas para selecionar/criar time, adicionar jogadores e enviar convites.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Etapa {wizard.step} de 3
          </div>

          {wizard.step === 1 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Selecionar time existente</Label>
                <Select
                  value={wizard.existingTeamId || "none"}
                  onValueChange={(value) =>
                    setWizard((prev) => ({ ...prev, existingTeamId: value === "none" ? "" : value }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Criar novo time</SelectItem>
                    {selectedTeams
                      .filter((team) => team.owner_user_id === user.id)
                      .map((team) => (
                        <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {!wizard.existingTeamId && (
                <div className="space-y-2">
                  <Label>Novo time</Label>
                  <Input
                    value={wizard.newTeamName}
                    onChange={(e) => setWizard((prev) => ({ ...prev, newTeamName: e.target.value }))}
                    placeholder="Nome do time"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setWizard((prev) => ({ ...prev, step: 2 }))}>Próximo</Button>
              </div>
            </div>
          )}

          {wizard.step === 2 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={wizard.inviteSearch}
                  onChange={(e) => setWizard((prev) => ({ ...prev, inviteSearch: e.target.value }))}
                  placeholder="Buscar jogador por nome"
                />
                <Button variant="outline" onClick={addInviteToWizard}>Adicionar</Button>
              </div>

              <div className="space-y-2">
                {wizard.invites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum jogador adicionado ainda.</p>
                ) : (
                  wizard.invites.map((invite) => (
                    <div key={invite.user_id} className="flex items-center justify-between rounded-md border border-border/50 p-2 text-xs">
                      <span>{invite.display_name}</span>
                      <Badge variant="outline">{invite.status}</Badge>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setWizard((prev) => ({ ...prev, step: 1 }))}>Voltar</Button>
                <Button onClick={() => setWizard((prev) => ({ ...prev, step: 3 }))}>Próximo</Button>
              </div>
            </div>
          )}

          {wizard.step === 3 && (
            <div className="space-y-3">
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                O time só será confirmado após todos os jogadores aceitarem.
              </div>
              <p className="text-sm text-foreground">Convites preparados: {wizard.invites.length}</p>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setWizard((prev) => ({ ...prev, step: 2 }))}>Voltar</Button>
                <Button disabled={submittingWizard} onClick={submitTeamRegistrationWizard}>
                  {submittingWizard ? "Enviando..." : "Enviar inscrição"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
};

export default AdminTournament;
