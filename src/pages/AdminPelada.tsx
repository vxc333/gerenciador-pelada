import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, Link as LinkIcon, Shield, Shuffle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Json, Tables } from "@/integrations/supabase/types";

type DrawTeam = { team: number; players: string[] };
type PeladaRow = Omit<Tables<"peladas">, "draw_result"> & { draw_result: DrawTeam[] | null };
type MemberRow = Tables<"pelada_members">;
type GuestRow = Tables<"pelada_member_guests">;
type JoinRequestRow = Tables<"pelada_join_requests">;
type PeladaAdminRow = Tables<"pelada_admins">;
type PeladaBanRow = Tables<"pelada_bans">;
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

const shuffle = <T,>(arr: T[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const AdminPelada = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();

  const [pelada, setPelada] = useState<PeladaRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestRow[]>([]);
  const [delegatedAdmins, setDelegatedAdmins] = useState<PeladaAdminRow[]>([]);
  const [bans, setBans] = useState<PeladaBanRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfileRow>>({});
  const [openAt, setOpenAt] = useState("");
  const [listPriorityMode, setListPriorityMode] = useState<Tables<"peladas">["list_priority_mode"]>("confirmation_order");
  const [guestPriorityMode, setGuestPriorityMode] = useState<Tables<"peladas">["guest_priority_mode"]>("grouped_with_member");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [banDaysByUser, setBanDaysByUser] = useState<Record<string, number>>({});
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id || !user) return;

    const { data: p, error: peladaError } = await supabase.from("peladas").select("*").eq("id", id).single();
    if (peladaError || !p) {
      setNotFound(true);
      return;
    }

    const [{ data: adminRows }, { data: superAdminRow }] = await Promise.all([
      supabase.from("pelada_admins").select("*").eq("pelada_id", id),
      supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    const hasSuperAdmin = !!superAdminRow;
    setIsSuperAdmin(hasSuperAdmin);

    const safeAdminRows = (adminRows || []).filter((row): row is PeladaAdminRow => !!row && !!row.user_id);

    const isOwner = p.user_id === user.id;
    const isDelegatedAdmin = safeAdminRows.some((row) => row.user_id === user.id);

    if (!isOwner && !isDelegatedAdmin && !hasSuperAdmin) {
      setForbidden(true);
      return;
    }

    setForbidden(false);
    setPelada({ ...p, draw_result: parseDrawResult(p.draw_result) });
    setOpenAt(format(new Date(p.confirmations_open_at), "yyyy-MM-dd'T'HH:mm"));
    setListPriorityMode(p.list_priority_mode);
    setGuestPriorityMode(p.guest_priority_mode);
    setDelegatedAdmins(safeAdminRows);

    const [{ data: membersData }, { data: guestsData }, { data: requestsData }, { data: bansData }] = await Promise.all([
      supabase.from("pelada_members").select("*").eq("pelada_id", id).order("created_at", { ascending: true }),
      supabase.from("pelada_member_guests").select("*").eq("pelada_id", id).order("created_at", { ascending: true }),
      supabase.from("pelada_join_requests").select("*").eq("pelada_id", id).order("created_at", { ascending: true }),
      supabase.from("pelada_bans").select("*").eq("pelada_id", id),
    ]);

    setMembers(membersData || []);
    setGuests(guestsData || []);
    setJoinRequests(requestsData || []);
    setBans(bansData || []);

    const ids = new Set<string>();
    (membersData || []).forEach((member) => ids.add(member.user_id));
    (requestsData || []).forEach((request) => ids.add(request.user_id));
    (bansData || []).forEach((ban) => ids.add(ban.user_id));

    if (ids.size === 0) {
      setProfilesByUserId({});
      return;
    }

    const { data: profiles } = await supabase.from("user_profiles").select("*").in("user_id", Array.from(ids));
    const map: Record<string, UserProfileRow> = {};
    (profiles || []).forEach((profile) => {
      map[profile.user_id] = profile;
    });
    setProfilesByUserId(map);
  }, [id, user]);

  useEffect(() => {
    if (id && user) fetchAll();
  }, [id, user, fetchAll]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`admin-pelada-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_members", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_member_guests", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_join_requests", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_admins", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_bans", filter: `pelada_id=eq.${id}` }, () => fetchAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "peladas", filter: `id=eq.${id}` }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchAll]);

  const adminUserIds = useMemo(() => {
    const ids = new Set(delegatedAdmins.map((row) => row.user_id));
    if (pelada?.user_id) ids.add(pelada.user_id);
    return ids;
  }, [delegatedAdmins, pelada?.user_id]);

  const guestsByMember = useMemo(() => {
    return guests.reduce<Record<string, GuestRow[]>>((acc, guest) => {
      acc[guest.pelada_member_id] = acc[guest.pelada_member_id] || [];
      acc[guest.pelada_member_id].push(guest);
      return acc;
    }, {});
  }, [guests]);

  const pendingRequests = useMemo(() => joinRequests.filter((request) => request.status === "pending"), [joinRequests]);
  const activeBans = useMemo(
    () => bans.filter((ban) => new Date(ban.expires_at).getTime() > Date.now()),
    [bans]
  );
  const bannedUserIds = useMemo(() => new Set(activeBans.map((ban) => ban.user_id)), [activeBans]);

  const approvedRequestUserIds = useMemo(() => {
    return new Set(joinRequests.filter((request) => request.status === "approved").map((request) => request.user_id));
  }, [joinRequests]);

  const adminCandidates = useMemo(() => {
    if (!pelada) return [];

    const ids = new Set<string>();
    if (pelada.user_id) ids.add(pelada.user_id);

    delegatedAdmins.forEach((row) => {
      if (row?.user_id) ids.add(row.user_id);
    });
    members.forEach((member) => {
      if (member?.user_id) ids.add(member.user_id);
    });
    approvedRequestUserIds.forEach((userId) => ids.add(userId));

    return Array.from(ids).map((userId) => {
      const profile = profilesByUserId[userId];
      const member = members.find((row) => row.user_id === userId);
      const wasApproved = approvedRequestUserIds.has(userId);

      return {
        userId,
        displayName: profile?.display_name || member?.member_name || "Usuario sem nome",
        isOwner: userId === pelada.user_id,
        isDelegatedAdmin: delegatedAdmins.some((row) => row.user_id === userId),
        isConfirmedMember: !!member,
        isApprovedJoin: wasApproved,
      };
    });
  }, [approvedRequestUserIds, delegatedAdmins, members, pelada?.user_id, profilesByUserId]);

  const sortedMembers = useMemo(() => {
    const copy = [...members];
    if (listPriorityMode === "member_priority") {
      copy.sort((a, b) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      return copy;
    }
    copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return copy;
  }, [members, listPriorityMode]);

  const eligibleEntries = useMemo(() => {
    const activeMembers = sortedMembers.filter((member) => !member.is_waiting && !member.is_goalkeeper);
    const names: string[] = [];

    activeMembers.forEach((member) => {
      names.push(member.member_name);
      (guestsByMember[member.id] || []).forEach((guest) => {
        names.push(guest.guest_name);
      });
    });

    return names;
  }, [guestsByMember, sortedMembers]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Pelada nao encontrada</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Voce nao tem permissao para administrar essa pelada.</p>
      </div>
    );
  }

  if (!pelada) return null;

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${pelada.id}`);
    toast.success("Link copiado!");
  };

  const saveOpenAt = async () => {
    const { error } = await supabase
      .from("peladas")
      .update({ confirmations_open_at: new Date(openAt).toISOString() })
      .eq("id", pelada.id);

    if (error) {
      toast.error("Nao foi possivel salvar horario de abertura");
      return;
    }

    toast.success("Horario de abertura atualizado");
    fetchAll();
  };

  const savePriorityModes = async () => {
    const { error } = await supabase
      .from("peladas")
      .update({ list_priority_mode: listPriorityMode, guest_priority_mode: guestPriorityMode })
      .eq("id", pelada.id);

    if (error) {
      toast.error("Nao foi possivel salvar regras de prioridade");
      return;
    }

    toast.success("Prioridade da lista atualizada");
    fetchAll();
  };

  const reviewJoinRequest = async (requestId: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("pelada_join_requests")
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending");

    if (error) {
      toast.error("Nao foi possivel revisar a solicitacao");
      return;
    }

    toast.success(status === "approved" ? "Solicitacao aprovada" : "Solicitacao recusada");
    fetchAll();
  };

  const grantDelegatedAdmin = async (targetUserId: string) => {
    if (!isSuperAdmin) {
      toast.error("Somente admin supremo pode delegar admins");
      return;
    }

    if (targetUserId === pelada.user_id) {
      toast.error("Esse usuario ja e o admin principal");
      return;
    }

    const { error } = await supabase.from("pelada_admins").insert({
      pelada_id: pelada.id,
      user_id: targetUserId,
      created_by: user.id,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Esse usuario ja e admin dessa pelada");
      } else {
        toast.error("Nao foi possivel delegar admin");
      }
      return;
    }

    toast.success("Admin delegado com sucesso");
    fetchAll();
  };

  const revokeDelegatedAdmin = async (targetUserId: string) => {
    if (!isSuperAdmin) {
      toast.error("Somente admin supremo pode remover admins delegados");
      return;
    }

    const { error } = await supabase
      .from("pelada_admins")
      .delete()
      .eq("pelada_id", pelada.id)
      .eq("user_id", targetUserId);

    if (error) {
      toast.error("Nao foi possivel remover admin");
      return;
    }

    toast.success("Admin removido");
    fetchAll();
  };

  const updateMemberPriority = async (memberId: string, priorityScore: number) => {
    const { error } = await supabase.from("pelada_members").update({ priority_score: priorityScore }).eq("id", memberId);
    if (error) {
      toast.error("Erro ao atualizar prioridade");
      return;
    }
    fetchAll();
  };

  const deleteMember = async (memberId: string) => {
    const { error } = await supabase.from("pelada_members").delete().eq("id", memberId);
    if (error) {
      toast.error("Erro ao remover membro");
      return;
    }
    toast.success("Membro removido");
    fetchAll();
  };

  const deleteGuest = async (guestId: string) => {
    const { error } = await supabase.from("pelada_member_guests").delete().eq("id", guestId);
    if (error) {
      toast.error("Erro ao remover convidado");
      return;
    }
    toast.success("Convidado removido");
    fetchAll();
  };

  const banUser = async (targetUserId: string) => {
    const days = Math.max(1, Math.floor(banDaysByUser[targetUserId] || 7));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const { error } = await supabase.from("pelada_bans").upsert(
      {
        pelada_id: pelada.id,
        user_id: targetUserId,
        reason: `Banido por ${days} dia(s)`,
        banned_by: user.id,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "pelada_id,user_id" }
    );

    if (error) {
      toast.error("Nao foi possivel banir o usuario");
      return;
    }

    await Promise.all([
      supabase.from("pelada_members").delete().eq("pelada_id", pelada.id).eq("user_id", targetUserId),
      supabase
        .from("pelada_join_requests")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("pelada_id", pelada.id)
        .eq("user_id", targetUserId),
    ]);

    toast.success(`Usuario banido por ${days} dia(s)`);
    fetchAll();
  };

  const unbanUser = async (targetUserId: string) => {
    const { error } = await supabase.from("pelada_bans").delete().eq("pelada_id", pelada.id).eq("user_id", targetUserId);
    if (error) {
      toast.error("Nao foi possivel remover banimento");
      return;
    }

    toast.success("Banimento removido");
    fetchAll();
  };

  const handleDraw = async () => {
    if (pelada.draw_done_at) {
      toast.error("Esse sorteio ja foi realizado e nao pode ser repetido.");
      return;
    }

    if (eligibleEntries.length === 0) {
      toast.error("Nao ha jogadores elegiveis para sorteio");
      return;
    }

    const shuffled = shuffle(eligibleEntries);
    const teams = Array.from({ length: pelada.num_teams }, (_, idx) => ({
      team: idx + 1,
      players: [] as string[],
    }));

    shuffled.forEach((name, index) => {
      teams[index % pelada.num_teams].players.push(name);
    });

    const { error } = await supabase
      .from("peladas")
      .update({
        draw_done_at: new Date().toISOString(),
        draw_result: teams,
      })
      .eq("id", pelada.id)
      .is("draw_done_at", null);

    if (error) {
      toast.error("Nao foi possivel concluir o sorteio");
      return;
    }

    toast.success("Sorteio realizado com sucesso!");
    fetchAll();
  };

  const formatOpenAt = () => {
    try {
      return format(new Date(pelada.confirmations_open_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR });
    } catch {
      return pelada.confirmations_open_at;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl text-primary sm:text-2xl">{pelada.title}</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {pelada.location} - {pelada.time} - {pelada.date}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl space-y-5 px-4 py-5">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copyLink} className="flex-1 gap-2 text-sm">
            <LinkIcon className="h-4 w-4" /> Link publico
          </Button>
          <Button onClick={handleDraw} className="flex-1 gap-2 text-sm" disabled={!!pelada.draw_done_at}>
            <Shuffle className="h-4 w-4" /> {pelada.draw_done_at ? "Sorteio finalizado" : "Fazer sorteio"}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">ABERTURA DAS CONFIRMACOES</h2>
          <p className="mb-2 text-xs text-muted-foreground">Atual: {formatOpenAt()}</p>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              className="border-border bg-secondary"
            />
            <Button onClick={saveOpenAt}>Salvar</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">PRIORIDADE DA LISTA</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Defina se a ordem segue confirmacao ou prioridade manual e como os convidados entram na fila.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Ordem principal</p>
              <Select value={listPriorityMode} onValueChange={(value) => setListPriorityMode(value as Tables<"peladas">["list_priority_mode"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmation_order">Ordem de confirmacao</SelectItem>
                  <SelectItem value="member_priority">Prioridade manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Convidados</p>
              <Select value={guestPriorityMode} onValueChange={(value) => setGuestPriorityMode(value as Tables<"peladas">["guest_priority_mode"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grouped_with_member">Agrupados no membro</SelectItem>
                  <SelectItem value="guest_added_order">Ordem de adicao</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={savePriorityModes}>Salvar prioridade</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">SOLICITACOES DE ENTRADA</h2>
          <p className="mb-3 text-xs text-muted-foreground">Admins da pelada aprovam ou recusam. Banidos nao podem ser aprovados.</p>

          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-2">
                <div>
                  <p className="text-sm text-foreground">{profilesByUserId[request.user_id]?.display_name || request.display_name}</p>
                  <p className="text-xs text-muted-foreground">{request.user_id}</p>
                </div>
                <div className="flex gap-1">
                  {bannedUserIds.has(request.user_id) ? (
                    <Button size="sm" variant="outline" disabled>
                      Usuario banido
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => reviewJoinRequest(request.id, "approved")} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reviewJoinRequest(request.id, "rejected")}
                    className="gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Recusar
                  </Button>
                </div>
              </div>
            ))}

            {pendingRequests.length === 0 && (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem solicitacoes pendentes</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">ADMINS DELEGADOS</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            O dono da pelada e sempre admin. Somente admin supremo pode promover ou remover admins delegados.
            Usuarios aprovados na entrada ja podem virar admin, mesmo antes da confirmacao de presenca.
          </p>

          <div className="space-y-2">
            {adminCandidates.map((candidate) => {
              const memberIsOwner = candidate.isOwner;
              const memberIsAdmin = adminUserIds.has(candidate.userId);

              return (
                <div key={`admin-${candidate.userId}`} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-2">
                  <div>
                    <p className="text-sm text-foreground">{candidate.displayName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{candidate.userId}</span>
                      {candidate.isConfirmedMember ? (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">Confirmado</span>
                      ) : candidate.isApprovedJoin ? (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">Aprovado sem confirmar</span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    {memberIsOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                        <Shield className="h-3.5 w-3.5" /> Dono
                      </span>
                    ) : memberIsAdmin ? (
                      isSuperAdmin ? (
                        <Button size="sm" variant="outline" onClick={() => revokeDelegatedAdmin(candidate.userId)}>
                          Remover admin
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                          <Shield className="h-3.5 w-3.5" /> Admin delegado
                        </span>
                      )
                    ) : (
                      isSuperAdmin ? (
                        <Button size="sm" onClick={() => grantDelegatedAdmin(candidate.userId)}>
                          Tornar admin
                        </Button>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}

            {adminCandidates.length === 0 && (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">
                Ainda nao ha usuarios aprovados para delegar
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">SELECAO PARA O JOGO</h2>
          <p className="mb-3 text-xs text-muted-foreground">Todos fora da espera entram no sorteio automaticamente. Goleiros nao entram no sorteio.</p>

          <div className="space-y-2">
            {sortedMembers.map((member) => (
              <div key={member.id} className="rounded-md border border-border bg-secondary/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">
                    {profilesByUserId[member.user_id]?.display_name || member.member_name}
                    {member.is_goalkeeper ? " (goleiro)" : ""}
                    {member.is_waiting ? " (espera)" : ""}
                    {bannedUserIds.has(member.user_id) ? " (banido)" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 w-20"
                      value={member.priority_score}
                      onChange={(e) => updateMemberPriority(member.id, Number(e.target.value || 0))}
                    />
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="h-8 w-20"
                      value={banDaysByUser[member.user_id] || 7}
                      onChange={(e) =>
                        setBanDaysByUser((prev) => ({
                          ...prev,
                          [member.user_id]: Number(e.target.value || 1),
                        }))
                      }
                    />
                    {bannedUserIds.has(member.user_id) ? (
                      <Button variant="outline" size="sm" onClick={() => unbanUser(member.user_id)}>
                        Desbanir
                      </Button>
                    ) : (
                      <Button variant="destructive" size="sm" onClick={() => banUser(member.user_id)}>
                        Banir dias
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMember(member.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {(guestsByMember[member.id] || []).map((guest) => (
                  <div
                    key={guest.id}
                    className="mt-2 flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs"
                  >
                    <span>
                      {guest.guest_name} (convidado de {profilesByUserId[member.user_id]?.display_name || member.member_name})
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteGuest(guest.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {members.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sem confirmacoes ainda</p>}
          </div>

          <div className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Elegiveis para sorteio: {eligibleEntries.length}
          </div>
        </div>

        {pelada.draw_done_at && Array.isArray(pelada.draw_result) && (
          <div className="rounded-lg border border-accent/30 bg-card p-4">
            <h2 className="mb-2 font-display text-lg text-accent">RESULTADO OFICIAL (UNICO)</h2>
            <div className="space-y-3">
              {pelada.draw_result.map((team) => (
                <div key={team.team} className="rounded-md bg-secondary p-3">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Time {team.team}</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {team.players.map((playerName, idx) => (
                      <li key={`${team.team}-${idx}`}>{playerName}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPelada;
