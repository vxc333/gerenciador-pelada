import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Trash2, ArrowLeft } from "lucide-react";
import { formatDateBrasiliaLong, formatWeekdayDateTimeBrasilia } from "@/lib/datetime-br";
import { buildOrderedPeladaEntries, sortPeladaMembers } from "@/lib/pelada-participants";
import { getPeladaRules } from "@/lib/pelada-rules";
import type { Json, Tables } from "@/integrations/supabase/types";

type DrawTeam = { team: number; players: string[] };
type PeladaRow = Omit<Tables<"peladas">, "draw_result"> & { draw_result: DrawTeam[] | null };
type MemberRow = Tables<"pelada_members">;
type GuestRow = Tables<"pelada_member_guests">;
type JoinRequestRow = Tables<"pelada_join_requests">;
type UserProfileRow = Tables<"user_profiles">;

const parseDrawResult = (value: Json | null): DrawTeam[] | null => {
  if (!Array.isArray(value)) return null;

  const parsed = value
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;

      const rawTeam = (item as { team?: Json }).team;
      const rawPlayers = (item as { players?: Json }).players;

      if (typeof rawTeam !== "number" || !Array.isArray(rawPlayers)) return null;
      if (!rawPlayers.every((player) => typeof player === "string")) return null;

      return {
        team: rawTeam,
        players: rawPlayers,
      };
    })
    .filter((team): team is DrawTeam => team !== null);

  return parsed;
};

const getInitial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
};

const PublicPelada = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading, profileChecked, hasProfileName } = useAuth();

  const [pelada, setPelada] = useState<PeladaRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [memberName, setMemberName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [isGuestGoalkeeper, setIsGuestGoalkeeper] = useState(false);
  const [isGoalkeeper, setIsGoalkeeper] = useState(false);
  const [myJoinRequest, setMyJoinRequest] = useState<JoinRequestRow | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfileRow | null>(null);
  const [isDelegatedAdmin, setIsDelegatedAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAutomaticMember, setIsAutomaticMember] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [rules, setRules] = useState(getPeladaRules(""));
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const fetchAll = useCallback(async () => {
    if (!id) return;

    const { data: p, error: peladaError } = await supabase.from("peladas").select("*").eq("id", id).single();
    if (peladaError || !p) {
      setNotFound(true);
      return;
    }

    setPelada({
      ...p,
      draw_result: parseDrawResult(p.draw_result),
    });
    setRules(getPeladaRules(p.id));

    const { data: membersData } = await supabase
      .from("pelada_members")
      .select("*")
      .eq("pelada_id", id)
      .order("created_at", { ascending: true });

    const { data: guestsData } = await supabase
      .from("pelada_member_guests")
      .select("*")
      .eq("pelada_id", id)
      .order("created_at", { ascending: true });

    if (user) {
      const [{ data: requestData }, { data: delegatedAdminRow }, { data: banRow }, { data: profileData }, { data: autoMemberRow }, { data: superAdminRow }] = await Promise.all([
        supabase.from("pelada_join_requests").select("*").eq("pelada_id", id).eq("user_id", user.id).maybeSingle(),
        supabase.from("pelada_admins").select("id").eq("pelada_id", id).eq("user_id", user.id).maybeSingle(),
        supabase
          .from("pelada_bans")
          .select("id")
          .eq("pelada_id", id)
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
        supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("pelada_automatic_members").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);

      setMyJoinRequest(requestData || null);
      setIsDelegatedAdmin(!!delegatedAdminRow);
      setIsSuperAdmin(!!superAdminRow);
      setIsAutomaticMember(!!autoMemberRow);
      setIsBanned(!!banRow);
      setMyProfile(profileData || null);

      // Fetch pending requests if user is admin
      const isAdminHere = !!delegatedAdminRow || p.user_id === user.id || !!superAdminRow;
      if (isAdminHere) {
        const { count } = await supabase
          .from("pelada_join_requests")
          .select("*", { count: "exact", head: true })
          .eq("pelada_id", id)
          .eq("status", "pending");
        setPendingRequestsCount(count || 0);
      } else {
        setPendingRequestsCount(0);
      }
    } else {
      setMyJoinRequest(null);
      setIsDelegatedAdmin(false);
      setIsSuperAdmin(false);
      setIsAutomaticMember(false);
      setIsBanned(false);
      setMyProfile(null);
      setPendingRequestsCount(0);
    }

    setMembers(membersData || []);
    setGuests(guestsData || []);
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    fetchAll();
  }, [id, fetchAll]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`public-pelada-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_members", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_member_guests", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_bans", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_join_requests", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "peladas", filter: `id=eq.${id}` }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchAll]);

  const myMember = useMemo(() => members.find((m) => m.user_id === user?.id), [members, user?.id]);
  const isAdmin = !!user && !!pelada && (pelada.user_id === user.id || isDelegatedAdmin);
  const approvedMember = myJoinRequest?.status === "approved";
  const canAccessPelada = !isBanned && (isAdmin || approvedMember || isAutomaticMember);
  const profileHasName = !!myProfile?.display_name?.trim();
  const confirmationsOpen = !!pelada && new Date() >= new Date(pelada.confirmations_open_at);
  const canConfirm = canAccessPelada && (isAdmin || confirmationsOpen);
  const showProgressiveWarning =
    !!pelada &&
    !confirmationsOpen &&
    new Date(pelada.confirmations_open_at).getTime() - Date.now() <= rules.progressiveWarningHours * 60 * 60 * 1000;

  const getInitialMemberName = useCallback(() => {
    const fromProfile = myProfile?.display_name?.trim();
    if (fromProfile) return fromProfile;
    const fromMetadata = user?.user_metadata?.full_name as string | undefined;
    if (fromMetadata && fromMetadata.trim().length > 0) return fromMetadata.trim();
    if (user?.email) return user.email.split("@")[0];
    return "";
  }, [myProfile?.display_name, user]);

  const preferredMemberName = getInitialMemberName().trim();

  useEffect(() => {
    if (!memberName && user) {
      setMemberName(getInitialMemberName());
    }
  }, [user, memberName, getInitialMemberName]);

  useEffect(() => {
    // Auto-confirm: admins (owner or delegated) BUT NOT super admins
    const autoEnroll = async () => {
      if (!user || !pelada || myMember || isBanned || !preferredMemberName) return;
      if (!canAccessPelada) return;

      const isAdminOfThisPelada = pelada.user_id === user.id || isDelegatedAdmin;
      
      // Auto-confirm if: admin of this pelada (and NOT super admin) OR regular member with rule enabled
      const shouldAutoConfirm = (isAdminOfThisPelada && !isSuperAdmin) || (!isAdminOfThisPelada && rules.autoConfirmAdmins);
      
      if (!shouldAutoConfirm) return;

      const { error } = await supabase.from("pelada_members").upsert(
        {
          pelada_id: pelada.id,
          user_id: user.id,
          member_name: preferredMemberName,
          member_avatar_url: myProfile?.avatar_url || null,
          is_goalkeeper: false,
        },
        { onConflict: "pelada_id,user_id" }
      );

      if (error) {
        console.error("Erro ao confirmar presença:", error);
        return;
      }

      fetchAll();
    };

    autoEnroll();
  }, [canAccessPelada, fetchAll, isDelegatedAdmin, isSuperAdmin, isBanned, myMember, myProfile?.avatar_url, pelada, preferredMemberName, rules.autoConfirmAdmins, user]);

  const handleConfirmMe = async () => {
    if (!user || !pelada) return;
    if (isBanned) {
      toast.error("Você foi banido desta pelada");
      return;
    }
    if (!canAccessPelada) {
      toast.error("Sua entrada na pelada ainda não foi aprovada pelo admin");
      return;
    }
    if (!canConfirm) {
      toast.error("A confirmação ainda não está liberada");
      return;
    }

    const trimmed = isAdmin ? preferredMemberName : memberName.trim();
    if (!trimmed) {
      toast.error("Informe seu nome no perfil");
      return;
    }

    const { error } = await supabase.from("pelada_members").upsert(
      {
        pelada_id: pelada.id,
        user_id: user.id,
        member_name: trimmed,
        member_avatar_url: myProfile?.avatar_url || null,
        is_goalkeeper: isGoalkeeper,
      },
      { onConflict: "pelada_id,user_id" }
    );

    if (error) {
      toast.error("Não foi possível confirmar sua presença");
      return;
    }

    toast.success("Presença confirmada");
    fetchAll();
  };

  const handleRemoveMe = async () => {
    if (!myMember) return;

    const { error } = await supabase.from("pelada_members").delete().eq("id", myMember.id);
    if (error) {
      toast.error("Não foi possível remover sua confirmação");
      return;
    }

    toast.success("Sua confirmação foi removida");
    fetchAll();
  };

  const handleAddGuest = async () => {
    if (!pelada || !myMember) {
      toast.error("Confirme sua presença antes de adicionar convidado");
      return;
    }

    if (isBanned) {
      toast.error("Você foi banido desta pelada");
      return;
    }

    if (!canAccessPelada) {
      toast.error("Sua entrada na pelada ainda não foi aprovada pelo admin");
      return;
    }

    if (!canConfirm) {
      toast.error("A confirmação ainda não está liberada");
      return;
    }

    const trimmed = guestName.trim();
    if (!trimmed) {
      toast.error("Informe o nome do convidado");
      return;
    }

    const myGuestCount = guests.filter((guest) => guest.pelada_member_id === myMember.id).length;
    if (myGuestCount >= rules.maxGuestsPerMember) {
      toast.error(`Limite de convidados atingido (${rules.maxGuestsPerMember})`);
      return;
    }

    const finalGuestName = isGuestGoalkeeper ? `${trimmed} (goleiro)` : trimmed;

    const { error } = await supabase.from("pelada_member_guests").insert({
      pelada_id: pelada.id,
      pelada_member_id: myMember.id,
      guest_name: finalGuestName,
    });

    if (error) {
      toast.error("Não foi possível adicionar convidado");
      return;
    }

    setGuestName("");
    setIsGuestGoalkeeper(false);
    toast.success("Convidado adicionado");
    fetchAll();
  };

  const handleRemoveGuest = async (guestId: string) => {
    const { error } = await supabase.from("pelada_member_guests").delete().eq("id", guestId);
    if (error) {
      toast.error("Não foi possível remover convidado");
      return;
    }

    toast.success("Convidado removido");
    fetchAll();
  };

  const handleRequestAccess = async () => {
    if (!user || !pelada) return;
    if (isBanned) {
      toast.error("Você está banido desta pelada");
      return;
    }

    if (!profileHasName) {
      toast.error("Complete seu perfil com nome antes de solicitar entrada");
      return;
    }

    const preferredName = myProfile?.display_name?.trim() || "Jogador";

    const { error } = await supabase.from("pelada_join_requests").insert({
      pelada_id: pelada.id,
      user_id: user.id,
      display_name: preferredName,
      status: "pending",
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Você já enviou uma solicitação para essa pelada");
      } else {
        toast.error("Não foi possível enviar sua solicitação");
      }
      return;
    }

    toast.success("Solicitação enviada para os admins");
    fetchAll();
  };

  const sortedMembers = useMemo(() => {
    if (!pelada) return [];
    return sortPeladaMembers(members, pelada.list_priority_mode);
  }, [members, pelada]);

  const orderedListEntries = useMemo(() => {
    if (!pelada) return [];
    return buildOrderedPeladaEntries(pelada, members, guests);
  }, [guests, members, pelada]);

  const memberCapacity = pelada?.max_players || 0;
  const gkCapacity = pelada?.max_goalkeepers || 0;

  const memberCount = orderedListEntries.filter((entry) => !entry.isGoalkeeper && !entry.isWaiting).length;
  const gkCount = orderedListEntries.filter((entry) => entry.isGoalkeeper && !entry.isWaiting).length;
  const waitingEntries = useMemo(() => orderedListEntries.filter((entry) => entry.isWaiting), [orderedListEntries]);

  const myWaitingPosition = useMemo(() => {
    if (!myMember?.is_waiting) return 0;
    const waitingQueue = waitingEntries.filter((entry) => entry.isGoalkeeper === myMember.is_goalkeeper);
    return waitingQueue.findIndex((entry) => entry.kind === "member" && entry.member.id === myMember.id) + 1;
  }, [myMember, waitingEntries]);

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(`/pelada/${id}`)}`} replace />;
  if (!hasProfileName) return <Navigate to="/?complete-profile=1" replace />;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Pelada não encontrada</p>
      </div>
    );
  }

  if (!pelada) return null;

  const formatOpenAt = () => {
    try {
      return `${formatWeekdayDateTimeBrasilia(pelada.confirmations_open_at)} (horário de Brasília)`;
    } catch {
      return pelada.confirmations_open_at;
    }
  };

  const formatGameDate = () => {
    try {
      return formatDateBrasiliaLong(new Date(`${pelada.date}T12:00:00Z`));
    } catch {
      return pelada.date;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6">
        <div className="container mx-auto flex max-w-md items-center justify-between gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 text-center">
            <h1 className="font-display text-2xl tracking-wider text-primary sm:text-3xl">{pelada.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{pelada.location} - {pelada.time}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatGameDate()}</p>
          </div>
          {isAdmin && (
            <Link to={`/admin/${id}`}>
              <Button variant="outline" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-primary">
                <Shield className="h-5 w-5" />
                {pendingRequestsCount > 0 && (
                  <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-[10px]">{pendingRequestsCount}</Badge>
                )}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <main className="container mx-auto max-w-md space-y-5 px-4 py-5">
        {isBanned && (
          <div className="rounded-lg border border-destructive/40 bg-card p-4">
            <p className="text-sm text-destructive">Você está banido desta pelada.</p>
          </div>
        )}

        {!isBanned && !canAccessPelada && (
          <div className="rounded-lg border border-primary/30 bg-card p-4">
            <h2 className="mb-2 font-display text-lg text-foreground">ENTRADA NA PELADA</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Para confirmar presença, o admin precisa aprovar sua entrada nesta pelada.
            </p>

            {!profileHasName ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Antes de solicitar entrada, complete seu nome no perfil.</p>
                <Link to="/">
                  <Button className="w-full">Ir para meu perfil</Button>
                </Link>
              </div>
            ) : myJoinRequest?.status === "pending" ? (
              <Button className="w-full" disabled>
                Solicitação enviada (aguardando)
              </Button>
            ) : myJoinRequest?.status === "rejected" ? (
              <Button className="w-full" disabled>
                Solicitação recusada pelo admin
              </Button>
            ) : (
              <Button onClick={handleRequestAccess} className="w-full">
                Solicitar entrada
              </Button>
            )}
          </div>
        )}

        <div className="rounded-lg border border-primary/30 bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">CONFIRME SUA PRESENÇA</h2>

          {!canConfirm && (
            <p className="mb-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Confirmações abertas em {formatOpenAt()}.
            </p>
          )}

          {showProgressiveWarning && (
            <p className="mb-3 rounded-md bg-accent/10 p-2 text-xs text-accent">
              Faltam menos de {rules.progressiveWarningHours}h para abrir as confirmações.
            </p>
          )}

          {isAdmin ? (
            <p className="mb-3 rounded-md bg-accent/10 p-2 text-xs text-accent">
              Você é admin desta pelada e já entra automaticamente na lista com o nome do seu perfil.
            </p>
          ) : (
            <div className="mb-3">
              <Input
                placeholder="Seu nome"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="border-border bg-secondary"
              />
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <Checkbox id="goalkeeper" checked={isGoalkeeper} onCheckedChange={(checked) => setIsGoalkeeper(!!checked)} />
            <label htmlFor="goalkeeper" className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Sou goleiro
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleConfirmMe} className="flex-1" disabled={!canConfirm || isBanned}>
              {myMember ? "Atualizar minha confirmação" : "Confirmar presença"}
            </Button>
            {myMember && (
              <Button variant="destructive" onClick={handleRemoveMe}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {myMember?.is_waiting && (
            <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Você está na lista de espera. Posição atual: {myWaitingPosition || "-"}. Quando surgir vaga, o primeiro da fila sobe automaticamente.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">CONVIDADOS</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Só você pode adicionar/remover seus convidados. Limite por membro: {rules.maxGuestsPerMember}.
          </p>
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="Nome do convidado"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddGuest()}
              className="border-border bg-secondary"
              disabled={!myMember}
            />
            <Button onClick={handleAddGuest} disabled={!myMember || (!canConfirm && !isAdmin) || isBanned}>
              Adicionar
            </Button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Checkbox id="guest-goalkeeper" checked={isGuestGoalkeeper} onCheckedChange={(checked) => setIsGuestGoalkeeper(!!checked)} />
            <label htmlFor="guest-goalkeeper" className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Convidado goleiro
            </label>
          </div>
          {!myMember && <p className="text-xs text-muted-foreground">Confirme sua presença para liberar convidados.</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">LISTA</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-primary">Jogadores: {memberCount}/{memberCapacity}</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-accent">Goleiros: {gkCount}/{gkCapacity}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-foreground">Convidados: {guests.length}</span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Membros e convidados entram na mesma lista. Ordem dos membros: {pelada.list_priority_mode === "member_priority" ? "prioridade" : "confirmação"} | convidados: {pelada.guest_priority_mode === "guest_added_order" ? "ordem de adição" : "junto do responsável"}
          </p>
          {waitingEntries.length > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">Lista de espera atual: {waitingEntries.length}</p>
          )}

          <div className="rounded-md border border-border bg-secondary/30 p-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participantes</p>
            <div className="space-y-2">
              {orderedListEntries.map((entry) => {
                if (entry.kind === "member") {
                  const member = entry.member;

                  return (
                    <div key={member.id} className="rounded-md border border-border bg-secondary/50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={member.member_avatar_url || undefined} alt={member.member_name} />
                            <AvatarFallback className="text-[11px] font-semibold">{getInitial(member.member_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-foreground">
                            {member.member_name}
                            {entry.isGoalkeeper ? " (goleiro)" : ""}
                            {entry.isWaiting ? " (espera)" : ""}
                            {pelada.list_priority_mode === "member_priority" ? ` (prio ${member.priority_score})` : ""}
                          </span>
                        </div>
                        {entry.isWaiting ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">espera</span> : null}
                      </div>
                    </div>
                  );
                }

                const guest = entry.guest;
                const canDelete = !!myMember && guest.pelada_member_id === myMember.id;

                return (
                  <div key={guest.id} className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] font-semibold">{getInitial(guest.guest_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-foreground">
                          {guest.guest_name}
                          {entry.isWaiting ? " (espera)" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.isWaiting ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">espera</span> : null}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveGuest(guest.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-muted-foreground">Responsável: {entry.hostMember?.member_name || "participante removido"}</p>
                  </div>
                );
              })}
              {orderedListEntries.length === 0 && (
                <p className="py-3 text-center text-sm text-muted-foreground">Sem participantes confirmados</p>
              )}
            </div>
          </div>

          {orderedListEntries.length === 0 && <p className="mt-3 py-3 text-center text-sm text-muted-foreground">Ninguém confirmou ainda</p>}
        </div>

        {pelada.draw_done_at && (
          <div className="rounded-lg border border-accent/30 bg-card p-4">
            <h2 className="mb-2 font-display text-lg text-accent">SORTEIO OFICIAL</h2>
            <p className="mb-3 text-xs text-muted-foreground">Esse sorteio foi realizado apenas uma vez.</p>

            {Array.isArray(pelada.draw_result) && pelada.draw_result.length > 0 ? (
              <div className="space-y-3">
                {pelada.draw_result.map((team) => (
                  <div key={team.team} className="rounded-md bg-secondary p-3">
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Time {team.team}</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {team.players.map((playerName, index) => (
                        <li key={`${team.team}-${index}`}>{playerName}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">O administrador finalizou o sorteio.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicPelada;
