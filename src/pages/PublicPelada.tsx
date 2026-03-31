import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  const { user, loading } = useAuth();

  const [pelada, setPelada] = useState<PeladaRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [memberName, setMemberName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [isGoalkeeper, setIsGoalkeeper] = useState(false);
  const [myJoinRequest, setMyJoinRequest] = useState<JoinRequestRow | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfileRow | null>(null);
  const [isDelegatedAdmin, setIsDelegatedAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [notFound, setNotFound] = useState(false);

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
      const [{ data: requestData }, { data: delegatedAdminRow }, { data: banRow }, { data: profileData }] = await Promise.all([
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
      ]);

      setMyJoinRequest(requestData || null);
      setIsDelegatedAdmin(!!delegatedAdminRow);
      setIsBanned(!!banRow);
      setMyProfile(profileData || null);
    } else {
      setMyJoinRequest(null);
      setIsDelegatedAdmin(false);
      setIsBanned(false);
      setMyProfile(null);
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "peladas", filter: `id=eq.${id}` }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchAll]);

  const myMember = useMemo(() => members.find((m) => m.user_id === user?.id), [members, user?.id]);
  const isAdmin = !!user && !!pelada && (pelada.user_id === user.id || isDelegatedAdmin);
  const approvedMember = myJoinRequest?.status === "approved";
  const canAccessPelada = !isBanned && (isAdmin || approvedMember);
  const profileHasName = !!myProfile?.display_name?.trim();
  const confirmationsOpen = !!pelada && new Date() >= new Date(pelada.confirmations_open_at);
  const canConfirm = canAccessPelada && (isAdmin || confirmationsOpen);

  const memberCapacity = pelada?.max_players || 0;
  const gkCapacity = pelada?.max_goalkeepers || 0;

  const memberCount = members.filter((m) => !m.is_goalkeeper && !m.is_waiting).length;
  const gkCount = members.filter((m) => m.is_goalkeeper && !m.is_waiting).length;
  const waitingMembers = members.filter((m) => m.is_waiting);

  const getInitialMemberName = useCallback(() => {
    const fromProfile = myProfile?.display_name?.trim();
    if (fromProfile) return fromProfile;
    const fromMetadata = user?.user_metadata?.full_name as string | undefined;
    if (fromMetadata && fromMetadata.trim().length > 0) return fromMetadata.trim();
    if (user?.email) return user.email.split("@")[0];
    return "";
  }, [myProfile?.display_name, user]);

  useEffect(() => {
    if (!memberName && user) {
      setMemberName(getInitialMemberName());
    }
  }, [user, memberName, getInitialMemberName]);

  const handleConfirmMe = async () => {
    if (!user || !pelada) return;
    if (isBanned) {
      toast.error("Voce foi banido desta pelada");
      return;
    }
    if (!canAccessPelada) {
      toast.error("Sua entrada na pelada ainda nao foi aprovada pelo admin");
      return;
    }
    if (!canConfirm) {
      toast.error("A confirmacao ainda nao esta liberada");
      return;
    }

    const trimmed = memberName.trim();
    if (!trimmed) {
      toast.error("Informe seu nome");
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
      toast.error("Nao foi possivel confirmar sua presenca");
      return;
    }

    toast.success("Presenca confirmada");
    fetchAll();
  };

  const handleRemoveMe = async () => {
    if (!myMember) return;

    const { error } = await supabase.from("pelada_members").delete().eq("id", myMember.id);
    if (error) {
      toast.error("Nao foi possivel remover sua confirmacao");
      return;
    }

    toast.success("Sua confirmacao foi removida");
    fetchAll();
  };

  const handleAddGuest = async () => {
    if (!pelada || !myMember) {
      toast.error("Confirme sua presenca antes de adicionar convidado");
      return;
    }

    if (isBanned) {
      toast.error("Voce foi banido desta pelada");
      return;
    }

    if (!canAccessPelada) {
      toast.error("Sua entrada na pelada ainda nao foi aprovada pelo admin");
      return;
    }

    if (!canConfirm) {
      toast.error("A confirmacao ainda nao esta liberada");
      return;
    }

    const trimmed = guestName.trim();
    if (!trimmed) {
      toast.error("Informe o nome do convidado");
      return;
    }

    const { error } = await supabase.from("pelada_member_guests").insert({
      pelada_id: pelada.id,
      pelada_member_id: myMember.id,
      guest_name: trimmed,
    });

    if (error) {
      toast.error("Nao foi possivel adicionar convidado");
      return;
    }

    setGuestName("");
    toast.success("Convidado adicionado");
    fetchAll();
  };

  const handleRemoveGuest = async (guestId: string) => {
    const { error } = await supabase.from("pelada_member_guests").delete().eq("id", guestId);
    if (error) {
      toast.error("Nao foi possivel remover convidado");
      return;
    }

    toast.success("Convidado removido");
    fetchAll();
  };

  const handleRequestAccess = async () => {
    if (!user || !pelada) return;
    if (isBanned) {
      toast.error("Voce esta banido desta pelada");
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
        toast.error("Voce ja enviou uma solicitacao para essa pelada");
      } else {
        toast.error("Nao foi possivel enviar sua solicitacao");
      }
      return;
    }

    toast.success("Solicitacao enviada para os admins");
    fetchAll();
  };

  if (loading) return null;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(`/pelada/${id}`)}`} replace />;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Pelada nao encontrada</p>
      </div>
    );
  }

  if (!pelada) return null;

  const formatOpenAt = () => {
    try {
      return format(new Date(pelada.confirmations_open_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR });
    } catch {
      return pelada.confirmations_open_at;
    }
  };

  const sortedMembers = [...members].sort((a, b) => {
    if (pelada.list_priority_mode === "member_priority") {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const waitingOrder = [...waitingMembers].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const myWaitingPosition = myMember?.is_waiting
    ? waitingOrder.findIndex((member) => member.id === myMember.id) + 1
    : 0;

  const guestsByMember = guests.reduce<Record<string, GuestRow[]>>((acc, guest) => {
    acc[guest.pelada_member_id] = acc[guest.pelada_member_id] || [];
    acc[guest.pelada_member_id].push(guest);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6 text-center">
        <h1 className="font-display text-2xl tracking-wider text-primary sm:text-3xl">{pelada.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{pelada.location} - {pelada.time}</p>
        <p className="mt-1 text-xs text-muted-foreground">{pelada.date}</p>
      </div>

      <main className="container mx-auto max-w-md space-y-5 px-4 py-5">
        {isBanned && (
          <div className="rounded-lg border border-destructive/40 bg-card p-4">
            <p className="text-sm text-destructive">Voce esta banido desta pelada.</p>
          </div>
        )}

        {!isBanned && !canAccessPelada && (
          <div className="rounded-lg border border-primary/30 bg-card p-4">
            <h2 className="mb-2 font-display text-lg text-foreground">ENTRADA NA PELADA</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Para confirmar presenca, o admin precisa aprovar sua entrada nesta pelada.
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
                Solicitacao enviada (aguardando)
              </Button>
            ) : myJoinRequest?.status === "rejected" ? (
              <Button className="w-full" disabled>
                Solicitacao recusada pelo admin
              </Button>
            ) : (
              <Button onClick={handleRequestAccess} className="w-full">
                Solicitar entrada
              </Button>
            )}
          </div>
        )}

        <div className="rounded-lg border border-primary/30 bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">CONFIRME SUA PRESENCA</h2>

          {!canConfirm && (
            <p className="mb-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Confirmacoes abertas em {formatOpenAt()}.
            </p>
          )}

          <div className="mb-3">
            <Input
              placeholder="Seu nome"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="border-border bg-secondary"
            />
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Checkbox id="goalkeeper" checked={isGoalkeeper} onCheckedChange={(checked) => setIsGoalkeeper(!!checked)} />
            <label htmlFor="goalkeeper" className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Sou goleiro
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleConfirmMe} className="flex-1" disabled={!canConfirm || isBanned}>
              {myMember ? "Atualizar minha confirmacao" : "Confirmar presenca"}
            </Button>
            {myMember && (
              <Button variant="destructive" onClick={handleRemoveMe}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {myMember?.is_waiting && (
            <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Voce esta na lista de espera. Posicao atual: {myWaitingPosition || "-"}. Quando surgir vaga, o primeiro da fila sobe automaticamente.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">CONVIDADOS</h2>
          <p className="mb-3 text-xs text-muted-foreground">So voce pode adicionar/remover seus convidados.</p>
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
          {!myMember && <p className="text-xs text-muted-foreground">Confirme sua presenca para liberar convidados.</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">LISTA</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-primary">Jogadores: {memberCount}/{memberCapacity}</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-accent">Goleiros: {gkCount}/{gkCapacity}</span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Ordem: {pelada.list_priority_mode === "member_priority" ? "prioridade do membro" : "confirmacao"} | convidados: {pelada.guest_priority_mode === "guest_added_order" ? "ordem de adicao" : "agrupados no membro"}
          </p>
          {waitingMembers.length > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">Lista de espera atual: {waitingMembers.length}</p>
          )}

          <div className="space-y-2">
            {sortedMembers.map((member) => {
              const memberGuests = guestsByMember[member.id] || [];
              const isMine = member.user_id === user.id;
              const orderedGuests =
                pelada.guest_priority_mode === "guest_added_order"
                  ? [...memberGuests].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  : memberGuests;

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
                        {member.is_goalkeeper ? " (goleiro)" : ""}
                        {member.is_waiting ? " (espera)" : ""}
                        {pelada.list_priority_mode === "member_priority" ? ` (prio ${member.priority_score})` : ""}
                      </span>
                    </div>
                    {member.is_waiting ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">espera</span> : null}
                  </div>

                  {orderedGuests.map((guest) => (
                    <div key={guest.id} className="mt-1 flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] font-semibold">{getInitial(guest.guest_name)}</AvatarFallback>
                        </Avatar>
                        <span>{guest.guest_name} (convidado de {member.member_name})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isMine && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveGuest(guest.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {members.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">Ninguem confirmou ainda</p>}
          </div>
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
