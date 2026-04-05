import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, Download, Link as LinkIcon, Shield, Shuffle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  formatDateBrasiliaLong,
  formatDateTimeBrasilia,
  formatWeekdayDateTimeBrasilia,
  fromBrasiliaDateTimeLocalInput,
  toBrasiliaDateTimeLocalInput,
} from "@/lib/datetime-br";
import { buildOrderedPeladaEntries, isGoalkeeperGuestName, sortPeladaMembers } from "@/lib/pelada-participants";
import { getPeladaRules, setPeladaRules, type PeladaRules } from "@/lib/pelada-rules";
import type { Json, Tables } from "@/integrations/supabase/types";

type DrawTeam = { team: number; players: string[] };
type PeladaRow = Omit<Tables<"peladas">, "draw_result"> & { draw_result: DrawTeam[] | null };
type MemberRow = Tables<"pelada_members">;
type GuestRow = Tables<"pelada_member_guests">;
type JoinRequestRow = Tables<"pelada_join_requests">;
type PeladaAdminRow = Tables<"pelada_admins">;
type PeladaBanRow = Tables<"pelada_bans">;
type UserProfileRow = Tables<"user_profiles">;
type TimelineEvent = { id: string; message: string; at: string };
type AdminMenu = "config" | "lista" | "historico" | "queridometro" | "membros";
type MemberStats = { userId: string; displayName: string; email: string; peladasCount: number; isGoalkeeper: boolean; isWaiting: boolean };

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

function normalizeTimeForInput(time?: string) {
  if (!time) return "12:00";
  if (typeof time !== "string") return "12:00";
  const hhmmMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hhmmMatch) {
    return `${hhmmMatch[1].padStart(2, "0")}:${hhmmMatch[2]}`;
  }
  const numMatch = time.match(/(\d{1,2})/);
  if (numMatch) return `${numMatch[1].padStart(2, "0")}:00`;
  return "12:00";
}

const AdminPelada = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading, profileChecked, hasProfileName } = useAuth();

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
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMaxPlayers, setEditMaxPlayers] = useState(0);
  const [editMaxGk, setEditMaxGk] = useState(0);
  const [editNumTeams, setEditNumTeams] = useState(5);
  const [editPlayersPerTeam, setEditPlayersPerTeam] = useState(4);
  const [activeMenu, setActiveMenu] = useState<AdminMenu>("config");
  const [externalGuestName, setExternalGuestName] = useState("");
  const [externalGuestIsGoalkeeper, setExternalGuestIsGoalkeeper] = useState(false);
  const [rules, setRules] = useState<PeladaRules>({
    autoConfirmAdmins: true,
    maxGuestsPerMember: 7,
    progressiveWarningHours: 24,
  });
  const [memberStats, setMemberStats] = useState<Record<string, MemberStats>>({});

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
    setRules(getPeladaRules(p.id));
    setOpenAt(toBrasiliaDateTimeLocalInput(p.confirmations_open_at));
    setListPriorityMode(p.list_priority_mode);
    setGuestPriorityMode(p.guest_priority_mode);
    setDelegatedAdmins(safeAdminRows);
    setEditTitle(p.title);
    setEditLocation(p.location);
    setEditTime(normalizeTimeForInput(p.time));
    setEditDate(p.date);
    setEditMaxPlayers(p.max_players);
    setEditMaxGk(p.max_goalkeepers);
    setEditNumTeams(p.num_teams);
    setEditPlayersPerTeam(p.players_per_team);

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
    setMemberStats({});

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

    // Calculate member participation statistics
    const { data: allMemberParticipations } = await supabase
      .from("pelada_members")
      .select("user_id, pelada_id")
      .in("user_id", Array.from(ids));

    const peladaCountByUser = new Map<string, Set<string>>();
    (allMemberParticipations || []).forEach((row) => {
      if (!peladaCountByUser.has(row.user_id)) {
        peladaCountByUser.set(row.user_id, new Set());
      }
      peladaCountByUser.get(row.user_id)?.add(row.pelada_id);
    });

    // Store peladaCountByUser for later use in useMemo
    setMemberStats(
      (membersData || []).reduce((acc, member) => {
        const peladaCount = peladaCountByUser.get(member.user_id)?.size || 0;
        acc[member.user_id] = {
          userId: member.user_id,
          displayName: member.member_name,
          email: "---",
          peladasCount: peladaCount,
          isGoalkeeper: member.is_goalkeeper,
          isWaiting: member.is_waiting,
        };
        return acc;
      }, {} as Record<string, MemberStats>)
    );
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

  // Update member display names when profiles change
  useEffect(() => {
    setMemberStats((prevStats) => {
      const updated = { ...prevStats };
      Object.entries(updated).forEach(([userId, stat]) => {
        const profile = profilesByUserId[userId];
        if (profile?.display_name) {
          updated[userId] = { ...stat, displayName: profile.display_name };
        }
      });
      return updated;
    });
  }, [profilesByUserId]);

  const adminUserIds = useMemo(() => {
    const ids = new Set(delegatedAdmins.map((row) => row.user_id));
    if (pelada?.user_id) ids.add(pelada.user_id);
    return ids;
  }, [delegatedAdmins, pelada?.user_id]);

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
}, [approvedRequestUserIds, delegatedAdmins, members, pelada, profilesByUserId]);

  const formatGameDate = () => {
    if (!pelada) return "";
    try {
      return formatDateBrasiliaLong(new Date(`${pelada.date}T12:00:00Z`));
    } catch {
      return pelada.date;
    }
  };

  const sortedMembers = useMemo(() => {
    return sortPeladaMembers(members, listPriorityMode);
  }, [members, listPriorityMode]);

  const getMemberDisplayName = useCallback(
    (member: MemberRow) => {
      if (member.admin_selected) return member.member_name;
      return profilesByUserId[member.user_id]?.display_name || member.member_name;
    },
    [profilesByUserId]
  );

  const orderedListEntries = useMemo(() => {
    if (!pelada) return [];
    return buildOrderedPeladaEntries(pelada, members, guests);
  }, [guests, members, pelada]);

  const eligibleEntries = useMemo(() => {
    return orderedListEntries
      .filter((entry) => !entry.isWaiting && !entry.isGoalkeeper)
      .map((entry) => (entry.kind === "member" ? getMemberDisplayName(entry.member) : entry.guest.guest_name));
  }, [getMemberDisplayName, orderedListEntries]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!pelada) return [];

    const requestsEvents: TimelineEvent[] = joinRequests.map((request) => {
      const actor = profilesByUserId[request.user_id]?.display_name || request.display_name || "Usuário";
      if (request.status === "pending") {
        return {
          id: `req-pending-${request.id}`,
          message: `${actor} solicitou entrada`,
          at: request.created_at,
        };
      }

      return {
        id: `req-review-${request.id}`,
        message: `${actor} foi ${request.status === "approved" ? "aprovado" : "recusado"}`,
        at: request.reviewed_at || request.created_at,
      };
    });

    const banEvents: TimelineEvent[] = bans.map((ban) => ({
      id: `ban-${ban.id}`,
      message: `${profilesByUserId[ban.user_id]?.display_name || "Usuário"} banido`,
      at: ban.banned_at,
    }));

    const memberEvents: TimelineEvent[] = members.map((member) => ({
      id: `member-${member.id}`,
      message: `${member.member_name} entrou na lista${member.is_waiting ? " (espera)" : ""}`,
      at: member.created_at,
    }));

    const drawEvents: TimelineEvent[] = pelada.draw_done_at
      ? [
          {
            id: `draw-${pelada.id}`,
            message: "Sorteio oficial concluído",
            at: pelada.draw_done_at,
          },
        ]
      : [];

    return [...requestsEvents, ...banEvents, ...memberEvents, ...drawEvents]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 80);
  }, [bans, joinRequests, members, pelada, profilesByUserId]);

  const saveRules = () => {
    if (!pelada) return;
    setPeladaRules(pelada.id, rules);
    toast.success("Regras da pelada salvas");
  };

  const exportTimelineCsv = () => {
    if (!pelada || timelineEvents.length === 0) {
      toast.error("Não há eventos para exportar");
      return;
    }

    const rows = [
      ["data_hora_brasilia", "evento"],
      ...timelineEvents.map((event) => [formatDateTimeBrasilia(event.at), event.message]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timeline-${pelada.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasProfileName) return <Navigate to="/?complete-profile=1" replace />;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Pelada não encontrada</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Você não tem permissão para administrar esta pelada.</p>
      </div>
    );
  }

  if (!pelada) return null;

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${pelada.id}`);
    toast.success("Link copiado!");
  };

  const formatEntryName = (entry: { kind: string } & any) => {
    if (entry.kind === "member") return getMemberDisplayName(entry.member);
    const guestName: string = entry.guest.guest_name || "";
    return guestName.replace(/\s*\(goleiro\)\s*$/i, "");
  };

  const copyFormattedList = () => {
    if (!pelada) return;

    const dateObj = new Date(`${pelada.date}T00:00:00Z`);
    const dd = String(dateObj.getUTCDate()).padStart(2, "0");
    const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");

    const titleLine = `LISTA - ${pelada.title.toUpperCase()} - ${dd}/${mm}`;

    const timeMatch = String(pelada.time || "").match(/(\d{1,2})/);
    const hour = timeMatch ? `${timeMatch[1]} H` : String(pelada.time || "");
    const locationLine = `${pelada.location || ""} - ${hour}`.trim();

    const totalSlots = pelada.max_players || (pelada.num_teams && pelada.players_per_team ? pelada.num_teams * pelada.players_per_team : 0);

    const nonGkNonWaiting = orderedListEntries.filter((e) => !e.isGoalkeeper && !e.isWaiting).map((e) => formatEntryName(e));
    const gkList = orderedListEntries.filter((e) => e.isGoalkeeper && !e.isWaiting).map((e) => formatEntryName(e));
    const waitList = orderedListEntries.filter((e) => e.isWaiting).map((e) => formatEntryName(e));

    const lines: string[] = [];
    lines.push(titleLine);
    lines.push("");
    if (locationLine) lines.push(locationLine);
    lines.push("");
    lines.push("Nome e sobrenome");
    lines.push("");

    for (let i = 1; i <= Math.max(totalSlots, nonGkNonWaiting.length); i += 1) {
      const name = nonGkNonWaiting[i - 1] || "";
      lines.push(`${i}- ${name}`);
    }

    lines.push("");
    lines.push("GOLEIROS:");
    lines.push("");
    if (gkList.length === 0) {
      lines.push("-");
    } else {
      gkList.forEach((gk) => lines.push(`• ${gk}`));
    }

    if (waitList.length > 0) {
      lines.push("");
      lines.push("LISTA DE ESPERA:");
      lines.push("");
      waitList.forEach((w, idx) => lines.push(`${idx + 1}- ${w}`));
    }

    const finalText = lines.join("\n");

    navigator.clipboard
      .writeText(finalText)
      .then(() => toast.success("Lista copiada no formato solicitado"))
      .catch(() => toast.error("Falha ao copiar a lista"));
  };

  const savePeladaDetails = async () => {
    const totalPlayers = editNumTeams * editPlayersPerTeam;

    const { error } = await supabase
      .from("peladas")
      .update({
        title: editTitle.trim(),
        location: editLocation.trim(),
        time: editTime.trim(),
        date: editDate,
        max_players: totalPlayers,
        max_goalkeepers: editMaxGk,
        num_teams: editNumTeams,
        players_per_team: editPlayersPerTeam,
      })
      .eq("id", pelada.id);

    if (error) {
      toast.error("Não foi possível salvar os dados da pelada");
      return;
    }

    toast.success("Dados da pelada atualizados");
    fetchAll();
  };

  const saveOpenAt = async () => {
    const openAtIso = fromBrasiliaDateTimeLocalInput(openAt);

    const { error } = await supabase
      .from("peladas")
      .update({ confirmations_open_at: openAtIso })
      .eq("id", pelada.id);

    if (error) {
      toast.error("Não foi possível salvar horário de abertura");
      return;
    }

    toast.success("Horário de abertura atualizado");
    fetchAll();
  };

  const savePriorityModes = async () => {
    const { error } = await supabase
      .from("peladas")
      .update({ list_priority_mode: listPriorityMode, guest_priority_mode: guestPriorityMode })
      .eq("id", pelada.id);

    if (error) {
      toast.error("Não foi possível salvar regras de prioridade");
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
      toast.error("Não foi possível revisar a solicitação");
      return;
    }

    toast.success(status === "approved" ? "Solicitação aprovada" : "Solicitação recusada");
    fetchAll();
  };

  const grantDelegatedAdmin = async (targetUserId: string) => {
    if (!isSuperAdmin) {
      return;
    }

    if (targetUserId === pelada.user_id) {
      toast.error("Esse usuário já é o admin principal");
      return;
    }

    const { error } = await supabase.from("pelada_admins").insert({
      pelada_id: pelada.id,
      user_id: targetUserId,
      created_by: user.id,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Esse usuário já é admin desta pelada");
      } else {
        toast.error("Não foi possível delegar admin");
      }
      return;
    }

    toast.success("Admin delegado com sucesso");
    fetchAll();
  };

  const revokeDelegatedAdmin = async (targetUserId: string) => {
    if (!isSuperAdmin) {
      return;
    }

    const { error } = await supabase
      .from("pelada_admins")
      .delete()
      .eq("pelada_id", pelada.id)
      .eq("user_id", targetUserId);

    if (error) {
      toast.error("Não foi possível remover admin");
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

  const addExternalGuestByAdmin = async () => {
    const trimmedName = externalGuestName.trim();
    if (!trimmedName) {
      toast.error("Informe o nome da pessoa para adicionar");
      return;
    }

    let adminMember = members.find((member) => member.user_id === user.id) || null;

    if (!adminMember) {
      const fallbackAdminName =
        profilesByUserId[user.id]?.display_name ||
        (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
        (user.email ? user.email.split("@")[0] : "Admin");

      const { data: insertedMember, error: insertMemberError } = await supabase
        .from("pelada_members")
        .insert({
          pelada_id: pelada.id,
          user_id: user.id,
          member_name: fallbackAdminName,
          is_goalkeeper: false,
        })
        .select("*")
        .single();

      if (insertMemberError && insertMemberError.code !== "23505") {
        toast.error("Não foi possível preparar a lista para convidados externos");
        return;
      }

      if (insertedMember) {
        adminMember = insertedMember;
      } else {
        const { data: existingAdminMember, error: memberLookupError } = await supabase
          .from("pelada_members")
          .select("*")
          .eq("pelada_id", pelada.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (memberLookupError || !existingAdminMember) {
          toast.error("Não foi possível localizar seu cadastro para adicionar convidado");
          return;
        }
        adminMember = existingAdminMember;
      }
    }

    const finalGuestName = externalGuestIsGoalkeeper ? `${trimmedName} (goleiro)` : trimmedName;
    const { error } = await supabase.from("pelada_member_guests").insert({
      pelada_id: pelada.id,
      pelada_member_id: adminMember.id,
      guest_name: finalGuestName,
      admin_selected: true,
    });

    if (error) {
      toast.error("Não foi possível adicionar pessoa externa na lista");
      return;
    }

    setExternalGuestName("");
    setExternalGuestIsGoalkeeper(false);
    toast.success("Pessoa adicionada na lista com sucesso");
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
      toast.error("Não foi possível banir o usuário");
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

    toast.success(`Usuário banido por ${days} dia(s)`);
    fetchAll();
  };

  const unbanUser = async (targetUserId: string) => {
    const { error } = await supabase.from("pelada_bans").delete().eq("pelada_id", pelada.id).eq("user_id", targetUserId);
    if (error) {
      toast.error("Não foi possível remover banimento");
      return;
    }

    toast.success("Banimento removido");
    fetchAll();
  };

  const handleDraw = async () => {
    if (pelada.draw_done_at) {
      toast.error("Esse sorteio já foi realizado e não pode ser repetido.");
      return;
    }

    if (eligibleEntries.length === 0) {
      toast.error("Não há jogadores elegíveis para sorteio");
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
      toast.error("Não foi possível concluir o sorteio");
      return;
    }

    toast.success("Sorteio realizado com sucesso!");
    fetchAll();
  };

  const formatOpenAt = () => {
    try {
      return `${formatWeekdayDateTimeBrasilia(pelada.confirmations_open_at)} (horário de Brasília)`;
    } catch {
      return pelada.confirmations_open_at;
    }
  };

  const totalConfiguredPlayers = Math.max(0, editNumTeams) * Math.max(0, editPlayersPerTeam);
  const totalCurrentConfirmed = members.length + guests.length;

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
              {pelada.location} • Horário: {pelada.time} • {formatGameDate()}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl space-y-5 px-4 py-5">
        <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-3">
          <p className="text-sm font-medium text-primary">
            <strong>Menu de Membros:</strong> Clique em <strong>"Membros"</strong> para gerenciar aprovações, solicitações pendentes e estatísticas dos jogadores.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={copyLink} className="flex-1 gap-2 text-sm">
            <LinkIcon className="h-4 w-4" /> Link público
          </Button>
          <Button onClick={handleDraw} className="flex-1 gap-2 text-sm" disabled={!!pelada.draw_done_at}>
            <Shuffle className="h-4 w-4" /> {pelada.draw_done_at ? "Sorteio finalizado" : "Fazer sorteio"}
          </Button>
          <Button onClick={copyFormattedList} className="flex-1 gap-2 text-sm">
            <Download className="h-4 w-4" /> Copiar lista
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={activeMenu === "config" ? "default" : "outline"} size="sm" onClick={() => setActiveMenu("config")} className="flex-1 min-w-[100px]">
              Configuração
            </Button>
            <Button variant={activeMenu === "membros" ? "default" : "outline"} size="sm" onClick={() => setActiveMenu("membros")} className="flex-1 min-w-[100px]">
              Membros
            </Button>
            <Button variant={activeMenu === "lista" ? "default" : "outline"} size="sm" onClick={() => setActiveMenu("lista")} className="flex-1 min-w-[100px]">
              Aprovações
            </Button>
            <Button variant={activeMenu === "historico" ? "default" : "outline"} size="sm" onClick={() => setActiveMenu("historico")} className="flex-1 min-w-[100px]">
              Histórico
            </Button>
            <Button variant={activeMenu === "queridometro" ? "default" : "outline"} size="sm" onClick={() => setActiveMenu("queridometro")} className="flex-1 min-w-[100px]">
              Queridômetro
            </Button>
          </div>
        </div>

        {activeMenu === "config" && (
        <>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">EDITAR PELADA</h2>
          <p className="mb-3 text-xs text-muted-foreground">Altere os dados principais da pelada e valide as vagas totais.</p>
          <div className="mb-3 grid gap-2 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground sm:grid-cols-3">
            <p>Times: <span className="font-semibold text-foreground">{editNumTeams}</span></p>
            <p>Jogadores por time: <span className="font-semibold text-foreground">{editPlayersPerTeam}</span></p>
            <p>Vagas de linha: <span className="font-semibold text-foreground">{totalConfiguredPlayers}</span></p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Titulo</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="border-border bg-secondary" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Local</label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="border-border bg-secondary" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Data</label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="border-border bg-secondary" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Horario</label>
                <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="border-border bg-secondary" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Qtd Times</label>
                <Input type="number" min={2} max={10} value={editNumTeams} onChange={(e) => setEditNumTeams(Number(e.target.value))} className="border-border bg-secondary" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Por time</label>
                <Input type="number" min={3} max={20} value={editPlayersPerTeam} onChange={(e) => setEditPlayersPerTeam(Number(e.target.value))} className="border-border bg-secondary" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max Goleiros</label>
                <Input type="number" min={1} max={10} value={editMaxGk} onChange={(e) => setEditMaxGk(Number(e.target.value))} className="border-border bg-secondary" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={savePeladaDetails}>Salvar dados</Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">ABERTURA DAS CONFIRMAÇÕES</h2>
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
            Defina se a ordem segue confirmação ou prioridade manual e como os convidados entram na fila.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Ordem principal</p>
              <Select value={listPriorityMode} onValueChange={(value) => setListPriorityMode(value as Tables<"peladas">["list_priority_mode"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmation_order">Ordem de confirmação</SelectItem>
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
                  <SelectItem value="guest_added_order">Ordem de adição</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={savePriorityModes}>Salvar prioridade</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">REGRAS CONFIGURÁVEIS</h2>
          <p className="mb-3 text-xs text-muted-foreground">Defina comportamento automático para admins, convidados e avisos de confirmação.</p>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={rules.autoConfirmAdmins}
                onChange={(e) => setRules((prev) => ({ ...prev, autoConfirmAdmins: e.target.checked }))}
              />
              Admins sempre confirmados automaticamente
            </label>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Limite de convidados por membro</p>
              <Input
                type="number"
                min={0}
                max={20}
                value={rules.maxGuestsPerMember}
                onChange={(e) => setRules((prev) => ({ ...prev, maxGuestsPerMember: Number(e.target.value || 0) }))}
              />
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Horas para aviso progressivo de confirmação</p>
              <Input
                type="number"
                min={1}
                max={168}
                value={rules.progressiveWarningHours}
                onChange={(e) => setRules((prev) => ({ ...prev, progressiveWarningHours: Number(e.target.value || 1) }))}
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <Button onClick={saveRules}>Salvar regras</Button>
          </div>
        </div>
        </>
        )}

        {activeMenu === "historico" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-foreground">HISTÓRICO DE PARTICIPAÇÃO</h2>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportTimelineCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="space-y-2">
            {timelineEvents.length === 0 && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Sem eventos registrados ainda.</p>
            )}

            {timelineEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-border bg-secondary/30 p-2">
                <p className="text-sm text-foreground">{event.message}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeBrasilia(event.at)} (Brasília)</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {activeMenu === "lista" && (
        <>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">SOLICITAÇÕES DE ENTRADA</h2>
          <p className="mb-3 text-xs text-muted-foreground">Admins da pelada aprovam ou recusam. Banidos não podem ser aprovados.</p>

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
                      Usuário banido
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
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem solicitações pendentes</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">ADICIONAR PESSOA EXTERNA (APENAS ADMIN)</h2>
          <p className="mb-3 text-xs text-muted-foreground">Use para confirmações feitas por fora (ex.: WhatsApp). A pessoa entra na lista normalmente.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Nome da pessoa</label>
              <Input
                value={externalGuestName}
                onChange={(e) => setExternalGuestName(e.target.value)}
                placeholder="Ex.: João do IF"
                className="border-border bg-secondary"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={externalGuestIsGoalkeeper}
                onChange={(e) => setExternalGuestIsGoalkeeper(e.target.checked)}
              />
              Goleiro
            </label>
            <Button onClick={addExternalGuestByAdmin}>Adicionar na lista</Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">ADMINS DELEGADOS</h2>

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
                Ainda não há usuários aprovados para delegar
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">SELEÇÃO PARA O JOGO</h2>
          <p className="mb-3 text-xs text-muted-foreground">Participantes e convidados aparecem na lista. Goleiros não entram no sorteio.</p>

          <div className="mb-3 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            Confirmados no total: <span className="font-semibold text-foreground">{totalCurrentConfirmed}</span> | Elegíveis para sorteio: <span className="font-semibold text-foreground">{eligibleEntries.length}</span>
          </div>

          <div className="space-y-2">
            {orderedListEntries.map((entry) => {
              if (entry.kind === "member") {
                const member = entry.member;

                return (
                  <div key={member.id} className="rounded-md border border-border bg-secondary/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        {getMemberDisplayName(member)}
                        {entry.isGoalkeeper ? " (goleiro)" : ""}
                        {entry.isWaiting ? " (espera)" : ""}
                        {bannedUserIds.has(member.user_id) ? " (banido)" : ""}
                        {member.is_automatic_entry ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs text-green-600">
                            Automático
                          </span>
                        ) : null}
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
                  </div>
                );
              }

              const guest = entry.guest;

              return (
                <div key={guest.id} className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      {guest.guest_name}
                      {guest.admin_selected ? " (externo via admin)" : " (convidado)"}
                      {entry.isWaiting ? " (espera)" : ""}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteGuest(guest.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vinculado a: {entry.hostMember ? getMemberDisplayName(entry.hostMember) : "participante removido"}
                  </p>
                </div>
              );
            })}

            {members.length === 0 && guests.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sem confirmações ainda</p>}
          </div>
        </div>
        </>
        )}

        {activeMenu === "membros" && (
        <>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">SOLICITAÇÕES PENDENTES</h2>
          <p className="mb-3 text-xs text-muted-foreground">Aprovações e recusas de entrada na pelada.</p>

          {pendingRequests.length === 0 ? (
            <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem solicitações pendentes</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-md border border-border bg-secondary/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{profilesByUserId[request.user_id]?.display_name || request.display_name}</p>
                      <p className="text-xs text-muted-foreground">ID: {request.user_id}</p>
                    </div>
                    <div className="flex gap-1">
                      {bannedUserIds.has(request.user_id) ? (
                        <Button size="sm" variant="outline" disabled>
                          Banido
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
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">MEMBROS CONFIRMADOS</h2>
          <p className="mb-3 text-xs text-muted-foreground">Lista de jogadores confirmados com estatísticas de participação.</p>

          {Object.keys(memberStats).length === 0 ? (
            <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem membros confirmados ainda</p>
          ) : (
            <div className="space-y-2">
              {sortedMembers.map((member) => {
                const stats = memberStats[member.user_id];
                if (!stats) return null;

                const statusLabels = [];
                if (member.is_goalkeeper) statusLabels.push("Goleiro");
                if (member.is_waiting) statusLabels.push("Espera");
                if (!member.is_goalkeeper && !member.is_waiting) statusLabels.push("Linha");

                return (
                  <div key={member.id} className="rounded-md border border-border bg-secondary/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground">{stats.displayName}</h3>
                          <div className="flex gap-1">
                            {statusLabels.map((status) => (
                              <span
                                key={status}
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  status === "Goleiro"
                                    ? "bg-accent/20 text-accent"
                                    : status === "Espera"
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-primary/15 text-primary"
                                }`}
                              >
                                {status}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">ID: {member.user_id}</p>
                        <p className="mt-1 text-sm text-foreground">
                          <span className="font-semibold">{stats.peladasCount}</span> pelada{stats.peladasCount !== 1 ? "s" : ""} participada{stats.peladasCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {activeMenu === "queridometro" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-display text-lg text-foreground">QUERIDÔMETRO (EM CONSTRUÇÃO)</h2>
          <p className="mb-3 text-sm text-muted-foreground">Módulo reservado para implementação futura.</p>
          <div className="space-y-2 rounded-md bg-secondary/30 p-3 text-sm text-muted-foreground">
            <p>- Registro de gols, assistências e defesas por jogador.</p>
            <p>- Opção de validação pelo admin ou auto-registro sem validação.</p>
            <p>- Votação de experiência por jogador de 1 a 5 estrelas.</p>
          </div>
        </div>
        )}

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
