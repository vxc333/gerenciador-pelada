import { useState, useEffect, useCallback } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Camera,
  Plus,
  Trash2,
  Link as LinkIcon,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  UserPlus,
  Shield,
  Trophy,
  LayoutDashboard,
  History,
  FolderKanban,
  Users,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateBrasiliaLong, formatDateTimeBrasilia, fromBrasiliaDateTimeLocalInput } from "@/lib/datetime-br";
import { calculateParticipationStats, getUserPeladaHistory, type ParticipationStats, type Badge as ParticipationBadge } from "@/lib/user-participation-stats";
import type { Tables } from "@/integrations/supabase/types";

type PeladaRow = Tables<"peladas">;
type JoinRequestStatus = Tables<"pelada_join_requests">["status"];

interface PeladaCard extends PeladaRow {
  confirmed_count?: number;
  my_request_status?: JoinRequestStatus | null;
  is_member?: boolean;
  is_confirmed?: boolean;
  is_admin?: boolean;
  pending_requests_count?: number;
}

type DashboardSection = "resumo" | "historico" | "admin" | "disponiveis";

interface UserProfile {
  display_name: string;
  avatar_url: string | null;
}

type NotificationEvent = {
  id: string;
  type: "request" | "approval" | "ban" | "draw";
  peladaId: string;
  peladaTitle: string;
  message: string;
  at: string;
  isPending?: boolean;
};

const getInitial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
};

const getDefaultOpenAt = (date: string) => {
  const base = new Date(`${date}T16:00:00`);
  base.setDate(base.getDate() - 2);
  return format(base, "yyyy-MM-dd'T'HH:mm");
};

const Index = () => {
  const { user, loading, profileChecked, hasProfileName, signOut } = useAuth();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  
  // Fallback para funções de formatação em caso de import falha
  const safeDateFormat = useCallback((value: Date | string) => {
    try {
      return formatDateTimeBrasilia(value);
    } catch {
      return typeof value === "string" ? value : value.toISOString();
    }
  }, []);

  const safeDateLongFormat = useCallback((value: Date | string) => {
    try {
      return formatDateBrasiliaLong(value);
    } catch {
      return typeof value === "string" ? value : value.toLocaleDateString("pt-BR");
    }
  }, []);
  const [myPeladas, setMyPeladas] = useState<PeladaCard[]>([]);
  const [availablePeladas, setAvailablePeladas] = useState<PeladaCard[]>([]);
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [openAt, setOpenAt] = useState(getDefaultOpenAt(format(new Date(), "yyyy-MM-dd")));
  const [numTeams, setNumTeams] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(10);
  const [maxGk, setMaxGk] = useState(3);
  const [title, setTitle] = useState("PELADA DO FURTO");
  const [peladaLocation, setPeladaLocation] = useState("IFMA");
  const [time, setTime] = useState("20 H");
  const [fetching, setFetching] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [pendingGlobalCount, setPendingGlobalCount] = useState(0);
  const [participationStats, setParticipationStats] = useState<ParticipationStats | null>(null);
  const [peladaHistory, setPeladaHistory] = useState<Array<{ id: string; peladaId: string; peladaTitle: string; peladaDate: string; peladaLocation: string; status: string; confirmed: boolean; createdAt: string }>>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>("resumo");

  const fetchParticipationStats = useCallback(async () => {
    if (!user) return;

    setLoadingStats(true);
    try {
      const [stats, history] = await Promise.all([
        calculateParticipationStats(user.id),
        getUserPeladaHistory(user.id, 10),
      ]);
      setParticipationStats(stats);
      setPeladaHistory(history);
    } catch (error) {
      console.error("Error fetching participation stats:", error);
    } finally {
      setLoadingStats(false);
    }
  }, [user]);

  const enrichWithCounts = useCallback(async (items: PeladaRow[]) => {
    const withCounts = await Promise.all(
      items.map(async (pelada) => {
        const { count: memberCount } = await supabase
          .from("pelada_members")
          .select("*", { count: "exact", head: true })
          .eq("pelada_id", pelada.id);

        const { count: guestCount } = await supabase
          .from("pelada_member_guests")
          .select("*", { count: "exact", head: true })
          .eq("pelada_id", pelada.id);

        return { ...pelada, confirmed_count: (memberCount || 0) + (guestCount || 0) };
      })
    );

    return withCounts;
  }, []);

  const fetchPeladas = useCallback(async () => {
    if (!user) return;

    setFetching(true);

    const [{ data: myData, error: myError }, { data: allData, error: allError }] = await Promise.all([
      supabase.from("peladas").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("peladas").select("*").order("date", { ascending: true }),
    ]);

    if (myError || allError) {
      toast.error("Erro ao carregar peladas");
      setFetching(false);
      return;
    }

    const [{ data: myRequests }, { data: myMemberships }, { data: myAdminRows }, { data: profileData }, { data: superAdminRow }, { data: autoMemberRow }] = await Promise.all([
      supabase.from("pelada_join_requests").select("pelada_id, status").eq("user_id", user.id),
      supabase.from("pelada_members").select("pelada_id").eq("user_id", user.id),
      supabase.from("pelada_admins").select("pelada_id").eq("user_id", user.id),
      supabase.from("user_profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("pelada_automatic_members").select("id").eq("user_id", user.id).maybeSingle(),
    ]);

    const profile = profileData as UserProfile | null;
    const suggestedName =
      (user.user_metadata?.full_name as string | undefined)?.trim() || (user.email ? user.email.split("@")[0] : "");

    setProfileName(profile?.display_name || suggestedName);
    setAvatarUrl(profile?.avatar_url || "");
    setProfileLoaded(true);
    setIsSuperAdmin(!!superAdminRow);

    const isAutoMember = !!autoMemberRow;

    const requestStatusByPelada = new Map<string, JoinRequestStatus>();
    (myRequests || []).forEach((row) => {
      requestStatusByPelada.set(row.pelada_id, row.status);
    });

    const memberPeladaIds = new Set((myMemberships || []).map((row) => row.pelada_id));
    const delegatedAdminPeladaIds = new Set((myAdminRows || []).map((row) => row.pelada_id));
    const hasSuperAdminRole = !!superAdminRow;

    const managedPeladaIds = hasSuperAdminRole
      ? new Set((allData || []).map((pelada) => pelada.id))
      : new Set([...(myData || []).map((pelada) => pelada.id), ...Array.from(delegatedAdminPeladaIds)]);

    let pendingByPelada = new Map<string, number>();
    const managedIds = Array.from(managedPeladaIds);
    if (managedIds.length > 0) {
      const { data: pendingRequests } = await supabase
        .from("pelada_join_requests")
        .select("pelada_id")
        .eq("status", "pending")
        .in("pelada_id", managedIds);

      pendingByPelada = (pendingRequests || []).reduce((acc, row) => {
        acc.set(row.pelada_id, (acc.get(row.pelada_id) || 0) + 1);
        return acc;
      }, new Map<string, number>());
    }

    const myEnriched = (await enrichWithCounts(myData || [])).map((pelada) => ({
      ...pelada,
      pending_requests_count: pendingByPelada.get(pelada.id) || 0,
    }));

    if (myEnriched.length > 0) {
      const last = myEnriched[0];
      setNumTeams(last.num_teams);
      setPlayersPerTeam(last.players_per_team);
      setMaxGk(last.max_goalkeepers);
      setTitle(last.title);
      setPeladaLocation(last.location);
      setTime(last.time);
    }

    const availableBase = (allData || []).filter((pelada) => pelada.user_id !== user.id);
    const availableEnriched = await enrichWithCounts(availableBase);

    const decoratedAvailable = availableEnriched.map((pelada) => {
      const delegatedAdmin = delegatedAdminPeladaIds.has(pelada.id);
      const isAdmin = delegatedAdmin || pelada.user_id === user.id;
      const requestStatus = requestStatusByPelada.get(pelada.id) || null;
      const isMember = memberPeladaIds.has(pelada.id) || requestStatus === "approved" || isAutoMember;
      const isConfirmed = memberPeladaIds.has(pelada.id);

      return {
        ...pelada,
        my_request_status: requestStatus,
        is_member: isMember,
        is_confirmed: isConfirmed,
        is_admin: isAdmin,
        pending_requests_count: pendingByPelada.get(pelada.id) || 0,
      };
    });

    const [requestsEventsRes, bansEventsRes] = await Promise.all([
      managedIds.length > 0
        ? supabase
            .from("pelada_join_requests")
            .select("id,pelada_id,status,display_name,created_at,reviewed_at")
            .in("pelada_id", managedIds)
            .order("created_at", { ascending: false })
            .limit(60)
        : Promise.resolve({ data: [] as Array<{ id: string; pelada_id: string; status: string; display_name: string; created_at: string; reviewed_at: string }> }),
      managedIds.length > 0
        ? supabase
            .from("pelada_bans")
            .select("id,pelada_id,reason,banned_at")
            .in("pelada_id", managedIds)
            .order("banned_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] as Array<{ id: string; pelada_id: string; reason: string; banned_at: string }> }),
    ]);

    const titlesById = new Map((allData || []).map((p) => [p.id, p.title]));

    const requestEvents: NotificationEvent[] = (requestsEventsRes.data || []).map((row: { id: string; pelada_id: string; status: string; display_name: string; created_at: string; reviewed_at: string }) => {
      if (row.status === "pending") {
        return {
          id: `request-${row.id}`,
          type: "request",
          peladaId: row.pelada_id,
          peladaTitle: titlesById.get(row.pelada_id) || "Pelada",
          message: `${row.display_name || "Usuário"} solicitou entrada`,
          at: row.created_at,
          isPending: true,
        };
      }

      return {
        id: `approval-${row.id}`,
        type: "approval",
        peladaId: row.pelada_id,
        peladaTitle: titlesById.get(row.pelada_id) || "Pelada",
        message: `${row.display_name || "Usuário"} foi ${row.status === "approved" ? "aprovado" : "recusado"}`,
        at: row.reviewed_at || row.created_at,
      };
    });

    const banEvents: NotificationEvent[] = (bansEventsRes.data || []).map((row: { id: string; pelada_id: string; reason: string; banned_at: string }) => ({
      id: `ban-${row.id}`,
      type: "ban",
      peladaId: row.pelada_id,
      peladaTitle: titlesById.get(row.pelada_id) || "Pelada",
      message: `Banimento registrado (${row.reason || "sem motivo"})`,
      at: row.banned_at,
    }));

    const drawEvents: NotificationEvent[] = (allData || [])
      .filter((pelada) => !!pelada.draw_done_at && managedPeladaIds.has(pelada.id))
      .map((pelada) => ({
        id: `draw-${pelada.id}-${pelada.draw_done_at}`,
        type: "draw" as const,
        peladaId: pelada.id,
        peladaTitle: pelada.title,
        message: "Sorteio concluído",
        at: pelada.draw_done_at as string,
      }));

    const mergedEvents = [...requestEvents, ...banEvents, ...drawEvents]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 40);

    setNotificationEvents(mergedEvents);
    setPendingGlobalCount(Array.from(pendingByPelada.values()).reduce((acc, value) => acc + value, 0));

    setMyPeladas(myEnriched);
    setAvailablePeladas(decoratedAvailable);
    setFetching(false);
  }, [user, enrichWithCounts]);

  useEffect(() => {
    if (user) {
      fetchPeladas();
      fetchParticipationStats();
    }
  }, [user, fetchPeladas, fetchParticipationStats]);

  useEffect(() => {
    if (!user || !profileChecked) return;

    if (!hasProfileName || new URLSearchParams(routerLocation.search).get("complete-profile") === "1") {
      setProfileModalOpen(true);
    }
  }, [hasProfileName, routerLocation.search, profileChecked, user]);

  useEffect(() => {
    const search = new URLSearchParams(routerLocation.search);
    if (search.get("complete-profile") !== "1" || !hasProfileName) return;

    search.delete("complete-profile");
    const query = search.toString();
    navigate(query ? `/?${query}` : "/", { replace: true });
  }, [hasProfileName, routerLocation.search, navigate]);

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleCreate = async () => {
    if (!isSuperAdmin) {
      return;
    }

    if (profileBlocked) {
      toast.error("Complete e salve seu nome no perfil antes de criar pelada");
      return;
    }

    const totalPlayers = numTeams * playersPerTeam;
    const openAtIso = fromBrasiliaDateTimeLocalInput(openAt);

    const { error } = await supabase.from("peladas").insert({
      user_id: user.id,
      date: newDate,
      title,
      location: peladaLocation,
      time,
      num_teams: numTeams,
      players_per_team: playersPerTeam,
      max_players: totalPlayers,
      max_goalkeepers: maxGk,
      confirmations_open_at: openAtIso,
    });

    if (error) {
      console.error("Erro ao criar pelada:", error);
      toast.error(`Erro ao criar pelada: ${error.message}`);
      return;
    }

    toast.success("Pelada criada!");
    setCreateModalOpen(false);
    fetchPeladas();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("peladas").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Pelada removida");
    fetchPeladas();
  };

  const handleRequestJoin = async (peladaId: string) => {
    if (!profileLoaded || !profileName.trim()) {
      toast.error("Complete seu perfil com nome antes de solicitar entrada");
      return;
    }

    const preferredName =
      profileName.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email ? user.email.split("@")[0] : "Jogador");

    const { error } = await supabase.from("pelada_join_requests").insert({
      pelada_id: peladaId,
      user_id: user.id,
      display_name: preferredName,
      status: "pending",
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Você já tem uma solicitação para essa pelada");
      } else {
        toast.error("Não foi possível enviar sua solicitação");
      }
      return;
    }

    toast.success("Solicitação enviada ao admin");
    fetchPeladas();
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${id}`);
    toast.success("Link copiado!");
  };

  const handleQuickConfirm = async (pelada: PeladaCard) => {
    if (!pelada.is_member) {
      toast.error("Você ainda não foi aprovado nessa pelada");
      return;
    }

    if (pelada.is_confirmed) {
      toast.success("Você já está confirmado nessa pelada");
      return;
    }

    const isOpen = new Date() >= new Date(pelada.confirmations_open_at);
    if (!isOpen && !pelada.is_admin) {
      toast.error("As confirmações ainda não abriram para essa pelada");
      return;
    }

    const preferredName =
      profileName.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email ? user.email.split("@")[0] : "Jogador");

    if (!preferredName) {
      toast.error("Complete seu perfil com nome antes de confirmar presença");
      return;
    }

    const { error } = await supabase.from("pelada_members").upsert(
      {
        pelada_id: pelada.id,
        user_id: user.id,
        member_name: preferredName,
        member_avatar_url: avatarUrl.trim() ? avatarUrl.trim() : null,
        is_goalkeeper: false,
      },
      { onConflict: "pelada_id,user_id" }
    );

    if (error) {
      toast.error("Não foi possível confirmar sua presença");
      return;
    }

    toast.success("Presença confirmada");
    fetchPeladas();
    fetchParticipationStats();
  };

  const formatDate = (dateStr: string) => {
    try {
      return formatDateBrasiliaLong(new Date(`${dateStr}T12:00:00Z`));
    } catch {
      return dateStr;
    }
  };

  const formatOpenAt = (openDateTime: string) => {
    try {
      return `${formatDateTimeBrasilia(openDateTime)} (Brasília)`;
    } catch {
      return openDateTime;
    }
  };

  const formatEventTime = (dateTime: string) => {
    try {
      return safeDateFormat(dateTime);
    } catch {
      return dateTime;
    }
  };

  const formatHistoryDate = (dateStr: string) => {
    try {
      return safeDateLongFormat(new Date(dateStr));
    } catch {
      return "Data desconhecida";
    }
  };

  const saveProfile = async () => {
    const displayName = profileName.trim();
    if (!displayName) {
      toast.error("Informe um nome para o perfil");
      return;
    }

    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl.trim() ? avatarUrl.trim() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      toast.error("Não foi possível salvar seu perfil");
      return;
    }

    toast.success("Perfil salvo");
    setProfileModalOpen(false);
    fetchPeladas();
  };

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!user || !file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar.${ext}`;

    setUploadingAvatar(true);

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });

    if (uploadError) {
      const message = uploadError.message?.toLowerCase() || "";
      if (message.includes("bucket") && message.includes("not")) {
        toast.error("Bucket 'avatars' não encontrado. Crie no Storage ou rode a migration nova.");
      } else {
        toast.error("Não foi possível enviar a foto");
      }
      setUploadingAvatar(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
    toast.success("Foto enviada. Clique em Salvar perfil para confirmar.");
  };

  const profileRequired = profileLoaded && !profileName.trim();
  const profileBlocked = !hasProfileName || profileRequired;

  const onboardingItems = isSuperAdmin
    ? [
        { key: "profile", label: "Completar perfil", done: !!hasProfileName },
        { key: "first-pelada", label: "Criar primeira pelada", done: myPeladas.length > 0 },
        { key: "review-requests", label: "Revisar solicitações pendentes", done: pendingGlobalCount === 0 },
      ]
    : [
        { key: "profile", label: "Completar perfil", done: !!hasProfileName },
        {
          key: "request-access",
          label: "Solicitar entrada em uma pelada",
          done: availablePeladas.some((p) => p.my_request_status === "pending" || p.my_request_status === "approved"),
        },
        {
          key: "confirm-presence",
          label: "Entrar em uma pelada aprovada",
          done: availablePeladas.some((p) => p.is_member),
        },
      ];

  const onboardingDoneCount = onboardingItems.filter((item) => item.done).length;
  const shouldShowOnboarding = onboardingDoneCount < onboardingItems.length;

  const navItems: Array<{ key: DashboardSection; label: string; icon: typeof LayoutDashboard; show: boolean }> = [
    { key: "resumo", label: "Painel", icon: LayoutDashboard, show: true },
    { key: "historico", label: "Histórico", icon: History, show: true },
    { key: "admin", label: "Minhas peladas", icon: FolderKanban, show: myPeladas.length > 0 || isSuperAdmin },
    { key: "disponiveis", label: "Peladas disponíveis", icon: Users, show: true },
  ];

  const renderPeladaCard = (p: PeladaCard, options?: { showAdminActions?: boolean; availableCard?: boolean; isNextUpcoming?: boolean }) => {
    const showAdminActions = options?.showAdminActions ?? false;
    const availableCard = options?.availableCard ?? false;
    const isNextUpcoming = options?.isNextUpcoming ?? false;

    const cardClassName = isNextUpcoming
      ? "rounded-lg border-2 border-primary bg-card/50 p-4 transition-colors hover:border-primary/80 shadow-lg shadow-primary/20"
      : "rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40";

    return (
      <div key={p.id} className={cardClassName}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className={`truncate font-display text-lg ${isNextUpcoming ? 'text-primary font-bold' : 'text-foreground'}`}>{isNextUpcoming && '⭐ '}{p.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(p.date)}
              </span>
              <span>{p.location}</span>
              <span>{p.time}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-block rounded-full bg-primary/20 px-3 py-0.5 text-xs font-medium text-primary">
                {p.confirmed_count || 0} confirmados
              </span>
              <span className="inline-block rounded-full bg-secondary px-3 py-0.5 text-xs font-medium text-foreground">
                linha: {p.max_players} | goleiros: {p.max_goalkeepers}
              </span>
              <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
                abre {formatOpenAt(p.confirmations_open_at)}
              </span>
              {p.draw_done_at && (
                <span className="inline-block rounded-full bg-accent/20 px-3 py-0.5 text-xs font-medium text-accent">
                  sorteio realizado
                </span>
              )}
              {availableCard && p.my_request_status === "pending" && (
                <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
                  aguardando aprovação
                </span>
              )}
              {availableCard && p.my_request_status === "rejected" && (
                <span className="inline-block rounded-full bg-destructive/20 px-3 py-0.5 text-xs font-medium text-destructive">
                  solicitação recusada
                </span>
              )}
              {availableCard && p.is_member && (
                <span className="inline-block rounded-full bg-primary/15 px-3 py-0.5 text-xs font-medium text-primary">
                  membro aprovado
                </span>
              )}
              {availableCard && p.is_admin && (
                <span className="inline-block rounded-full bg-accent/20 px-3 py-0.5 text-xs font-medium text-accent">
                  admin delegado
                </span>
              )}
              {(showAdminActions || p.is_admin) && (p.pending_requests_count || 0) > 0 && (
                <span className="inline-block rounded-full bg-destructive/20 px-3 py-0.5 text-xs font-medium text-destructive">
                  {p.pending_requests_count} solicitação(ões) pendente(s)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyLink(p.id)}
              title="Copiar link"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>

            {showAdminActions && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(p.id)}
                  title="Excluir"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
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
                <Button
                  className="w-full sm:w-auto"
                  variant={p.is_confirmed ? "secondary" : "default"}
                  disabled={!!p.is_confirmed || profileBlocked}
                  onClick={() => handleQuickConfirm(p)}
                >
                  {p.is_confirmed ? "Confirmado" : "Confirmar agora"}
                </Button>
              </>
            ) : p.my_request_status === "pending" ? (
              <Button className="w-full" disabled>
                Solicitação enviada
              </Button>
            ) : p.my_request_status === "rejected" ? (
              <Button className="w-full" disabled>
                Aguardando novo convite do admin
              </Button>
            ) : (
              !profileBlocked ? (
                <Button className="w-full gap-2" onClick={() => handleRequestJoin(p.id)}>
                  <UserPlus className="h-4 w-4" />
                  Solicitar entrada
                </Button>
              ) : null
            )}
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
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="font-display text-2xl tracking-wider text-primary sm:text-3xl">PELADA DO FURTO</h1>
          <div className="flex items-center gap-2">
            <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  {pendingGlobalCount > 0 && (
                    <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-[10px]">{pendingGlobalCount}</Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Central de notificações</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-2">
                  {notificationEvents.length === 0 && (
                    <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Sem eventos recentes.</p>
                  )}
                  {notificationEvents.map((event) => (
                    <div key={event.id} className="rounded-md border border-border bg-card p-3">
                      <p className="text-sm font-medium text-foreground">{event.peladaTitle}</p>
                      <p className="text-sm text-muted-foreground">{event.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatEventTime(event.at)}</p>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="ghost" onClick={signOut} className="gap-2 text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.key}
                  variant={activeSection === item.key ? "default" : "outline"}
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => setActiveSection(item.key)}
                >
                  <Icon className="mr-1 h-4 w-4" /> {item.label}
                </Button>
              );
            })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-5 rounded-lg border border-border bg-card p-3">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navegação</p>
              <div className="space-y-1">
                {navItems
                  .filter((item) => item.show)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.key}
                        variant={activeSection === item.key ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveSection(item.key)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Button>
                    );
                  })}
              </div>
            </div>
          </aside>

          <div>
        {activeSection === "resumo" && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-foreground">PAINEL</h2>
              <p className="text-sm text-muted-foreground">Gerencie seu perfil e crie novas peladas por modal.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin && (
                <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">admin supremo</span>
              )}

              <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Camera className="h-4 w-4" />
                    Meu perfil
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Meu perfil</DialogTitle>
                    <DialogDescription>Defina seu nome e foto. Sem foto, o avatar usa a inicial.</DialogDescription>
                  </DialogHeader>

                  {profileBlocked && (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
                      Complete seu nome para continuar usando o sistema.
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14 border border-border">
                      <AvatarImage src={avatarUrl || undefined} alt="Foto de perfil" />
                      <AvatarFallback className="font-semibold">{getInitial(profileName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <label
                        htmlFor="avatar-upload"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground hover:bg-secondary/80"
                      >
                        <Camera className="h-4 w-4" />
                        {uploadingAvatar ? "Enviando..." : "Enviar foto"}
                      </label>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingAvatar}
                        onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">Nome</label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="border-border bg-secondary"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveProfile}>Salvar perfil</Button>
                  </div>
                </DialogContent>
              </Dialog>

              {isSuperAdmin && (
                <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" disabled={profileBlocked}>
                      <Plus className="h-4 w-4" />
                      Nova pelada
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Nova pelada</DialogTitle>
                        <DialogDescription>Defina data, abertura e configurações da pelada.</DialogDescription>
                    </DialogHeader>

                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg text-foreground">Configuração</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSettings(!showSettings)}
                      className="gap-1 text-muted-foreground"
                    >
                      <SettingsIcon className="h-4 w-4" />
                      <span>Configurar</span>
                    </Button>
                  </div>

                  {showSettings && (
                    <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Título</label>
                          <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="border-border bg-secondary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Local</label>
                          <Input
                            value={peladaLocation}
                            onChange={(e) => setPeladaLocation(e.target.value)}
                            className="border-border bg-secondary"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Horário</label>
                          <Input
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="border-border bg-secondary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Qtd Times</label>
                          <Input
                            type="number"
                            min={2}
                            max={10}
                            value={numTeams}
                            onChange={(e) => setNumTeams(Number(e.target.value))}
                            className="border-border bg-secondary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Por time</label>
                          <Input
                            type="number"
                            min={3}
                            max={20}
                            value={playersPerTeam}
                            onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
                            className="border-border bg-secondary"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Max Goleiros</label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={maxGk}
                            onChange={(e) => setMaxGk(Number(e.target.value))}
                            className="border-border bg-secondary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Total jogadores</label>
                          <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                            {numTeams * playersPerTeam}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Data da pelada</label>
                      <Input
                        type="date"
                        value={newDate}
                        onChange={(e) => {
                          const nextDate = e.target.value;
                          setNewDate(nextDate);
                          setOpenAt(getDefaultOpenAt(nextDate));
                        }}
                        className="border-border bg-secondary"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">Abertura das confirmações</label>
                      <Input
                        type="datetime-local"
                        value={openAt}
                        onChange={(e) => setOpenAt(e.target.value)}
                        className="border-border bg-secondary"
                      />
                    </div>
                  </div>

                    <div className="flex justify-end">
                      <Button onClick={handleCreate} className="gap-2" disabled={profileBlocked}>
                        <Plus className="h-4 w-4" /> Criar
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {shouldShowOnboarding && (
            <div className="mt-4 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-sm font-medium text-foreground">
                Onboarding {isSuperAdmin ? "(admin)" : "(membro)"}: {onboardingDoneCount}/{onboardingItems.length}
              </p>
              <div className="mt-2 space-y-1">
                {onboardingItems.map((item) => (
                  <p key={item.key} className={`text-xs ${item.done ? "text-primary" : "text-muted-foreground"}`}>
                    {item.done ? "[OK]" : "[ ]"} {item.label}
                  </p>
                ))}
              </div>
            </div>
          )}

          {profileBlocked && (
            <p className="mt-3 text-xs text-destructive">Salve seu nome no perfil para continuar usando o sistema.</p>
          )}
        </div>
        )}

        {activeSection === "historico" && !loadingStats && participationStats && (
          <>
            <div className="mb-3 mt-8">
              <h2 className="font-display text-xl text-foreground">HISTÓRICO DE PARTICIPAÇÃO</h2>
            </div>
            <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">TOTAL JOGADO</p>
                  <p className="text-2xl font-bold text-foreground">{participationStats.totalParticipated ?? 0}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">CONFIRMAÇÕES</p>
                  <p className="text-2xl font-bold text-primary">{participationStats.totalConfirmed ?? 0}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">NÃO COMPARECEU</p>
                  <p className="text-2xl font-bold text-destructive">{participationStats.totalNoShow ?? 0}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">TAXA CONFIRMAÇÃO</p>
                  <p className="text-2xl font-bold text-accent">{participationStats.confirmationRate ?? 0}%</p>
                </div>
              </div>

              {participationStats.badges && participationStats.badges.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">BADGES DESBLOQUEADOS</p>
                  <div className="flex flex-wrap gap-2">
                    {participationStats.badges.map((badge: ParticipationBadge) => (
                      <div key={badge.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm" title={badge.description}>
                        <span className="mr-1">{badge.icon}</span>
                        {badge.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {peladaHistory && Array.isArray(peladaHistory) && peladaHistory.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">ÚLTIMAS PELADAS</p>
                  <div className="space-y-2">
                    {peladaHistory.slice(0, 5).map((pelada: { id: string; peladaId: string; peladaTitle: string; peladaDate: string; peladaLocation: string; confirmed: boolean }) => {
                      if (!pelada || !pelada.id) return null;
                      return (
                        <div key={pelada.id} className="flex items-center justify-between rounded-md border border-border/50 bg-secondary/20 p-2 text-xs">
                          <div>
                            <p className="font-medium text-foreground">{pelada.peladaTitle || "Pelada"}</p>
                            <p className="text-muted-foreground">
                              {pelada.peladaLocation || "Local desconhecido"} • 
                              {pelada.peladaDate ? formatHistoryDate(pelada.peladaDate) : "Data desconhecida"}
                            </p>
                          </div>
                          <div className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                            {pelada.confirmed ? "Confirmou" : "Nao compareceu"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeSection === "admin" && (
          <>
            <div className="mb-3">
              <h2 className="font-display text-xl text-foreground">MINHAS PELADAS (ADMIN)</h2>
            </div>
            {myPeladas.length > 0 ? (
              <div className="space-y-3">
                {myPeladas.map((pelada) => renderPeladaCard(pelada, { showAdminActions: true }))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="text-muted-foreground">Você ainda não tem peladas para administrar.</p>
              </div>
            )}
          </>
        )}

        {(activeSection === "disponiveis" || activeSection === "resumo") && (
        <>
        <div className="mb-3 mt-8">
          <h2 className="font-display text-xl text-foreground">PELADAS DISPONIVEIS</h2>
          <p className="text-sm text-muted-foreground">Solicite entrada para participar. Apenas admin pode aprovar.</p>
        </div>
        <div className="space-y-3">
          {!fetching && availablePeladas.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground">Nenhuma pelada disponivel no momento</p>
            </div>
          )}

          {availablePeladas.length > 0 && (
            <>
              <div className="rounded-lg border-2 border-primary/30 bg-secondary/20 p-2 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">⭐ Próxima pelada</p>
              </div>
              {renderPeladaCard(availablePeladas[0], { availableCard: true, isNextUpcoming: true })}
              {availablePeladas.slice(1).map((pelada) => renderPeladaCard(pelada, { availableCard: true }))}
            </>
          )}
        </div>
        </>
        )}

        {activeSection === "resumo" && myPeladas.length > 0 && (
          <>
            <div className="mb-3 mt-8">
              <h2 className="font-display text-xl text-foreground">MINHAS PELADAS (ADMIN)</h2>
            </div>
            <div className="space-y-3">
              {myPeladas.slice(0, 3).map((pelada) => renderPeladaCard(pelada, { showAdminActions: true }))}
            </div>
          </>
        )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
