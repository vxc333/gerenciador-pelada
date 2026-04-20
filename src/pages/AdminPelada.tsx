import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Clock, Download, Heart, Link as LinkIcon, List, Settings, Shield, Shuffle, Trash2, Users, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { MobileSectionNav } from "@/components/layout/MobileSectionNav";
import { PageState } from "@/components/layout/PageState";
import { toast } from "sonner";
import {
  formatDateBrasiliaLong,
  formatDateTimeBrasilia,
  formatWeekdayDateTimeBrasilia,
  formatDateTimeBrasiliaWithSeconds,
  fromBrasiliaDateTimeLocalInput,
  toBrasiliaDateTimeLocalInput,
} from "@/lib/datetime-br";
import { buildOrderedPeladaEntries, isGoalkeeperGuestName, sortPeladaMembers, type PeladaListEntry } from "@/lib/pelada-participants";
import { getPeladaRules, setPeladaRules, type PeladaRules } from "@/lib/pelada-rules";
import type { Json, Tables } from "@/integrations/supabase/types";

type DrawTeam = { team: number; players: string[] };
type PeladaRow = Omit<Tables<"peladas">, "draw_result"> & { draw_result: DrawTeam[] | null };
type MemberRow = Tables<"pelada_members">;
type GuestRow = Tables<"pelada_member_guests">;
type JoinRequestRow = Tables<"pelada_join_requests">;
type PeladaAdminRow = Tables<"pelada_admins">;
type PeladaBanRow = Tables<"pelada_bans">;
type SystemBanRow = Tables<"system_bans">;
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
  const [systemBans, setSystemBans] = useState<SystemBanRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfileRow>>({});
  const [openAt, setOpenAt] = useState("");
  const [listPriorityMode, setListPriorityMode] = useState<Tables<"peladas">["list_priority_mode"]>("confirmation_order");
  const [guestPriorityMode, setGuestPriorityMode] = useState<Tables<"peladas">["guest_priority_mode"]>("grouped_with_member");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [banDaysByUser, setBanDaysByUser] = useState<Record<string, number>>({});
  const [banPermanentByUser, setBanPermanentByUser] = useState<Record<string, boolean>>({});
  const [banApplyAllByUser, setBanApplyAllByUser] = useState<Record<string, boolean>>({});
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
  const [systemMemberSearch, setSystemMemberSearch] = useState("");
  const [systemMemberResults, setSystemMemberResults] = useState<UserProfileRow[]>([]);
  const [isSearchingSystemMembers, setIsSearchingSystemMembers] = useState(false);
  const [addingSystemMemberUserId, setAddingSystemMemberUserId] = useState<string | null>(null);

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
    // Initialize ban controls: days and permanent flag from existing bans
    const initialBanDays: Record<string, number> = {};
    const initialBanPermanent: Record<string, boolean> = {};
    (bansData || []).forEach((ban) => {
      if (!ban) return;
      if (ban.expires_at === null) {
        initialBanPermanent[ban.user_id] = true;
      } else {
        const diffMs = new Date(ban.expires_at).getTime() - Date.now();
        const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        initialBanDays[ban.user_id] = diffDays;
      }
    });
    setBanDaysByUser((prev) => ({ ...initialBanDays, ...prev }));
    setBanPermanentByUser((prev) => ({ ...initialBanPermanent, ...prev }));
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

    // Fetch system-wide bans for these users (if any)
    try {
      const { data: systemBansData } = await supabase.from("system_bans").select("*").in("user_id", Array.from(ids));
      setSystemBans(systemBansData || []);

      const initialBanApplyAll: Record<string, boolean> = {};
      (systemBansData || []).forEach((sb) => {
        if (!sb) return;
        if (sb.expires_at === null) {
          initialBanApplyAll[sb.user_id] = true;
          initialBanPermanent[sb.user_id] = true;
        } else if (new Date(sb.expires_at).getTime() > Date.now()) {
          initialBanApplyAll[sb.user_id] = true;
          const diffMs = new Date(sb.expires_at).getTime() - Date.now();
          const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          initialBanDays[sb.user_id] = diffDays;
        }
      });
      setBanDaysByUser((prev) => ({ ...initialBanDays, ...prev }));
      setBanPermanentByUser((prev) => ({ ...initialBanPermanent, ...prev }));
      setBanApplyAllByUser((prev) => ({ ...initialBanApplyAll, ...prev }));
    } catch (e) {
      // ignore
    }

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

  const isCurrentUserAdminOrSuper = useMemo(() => {
    if (!user) return false;
    return isSuperAdmin || adminUserIds.has(user.id);
  }, [user, isSuperAdmin, adminUserIds]);

  const getBanInfo = useCallback(
    (peladaId: string | undefined, userId: string | undefined) => {
      if (!userId) return null;
      const now = Date.now();
      const pban = bans.find((b) => b.pelada_id === peladaId && b.user_id === userId && (b.expires_at === null || new Date(b.expires_at).getTime() > now));
      if (pban) return { source: "pelada", expires_at: pban.expires_at };
      const sb = systemBans.find((s) => s.user_id === userId && (s.expires_at === null || new Date(s.expires_at).getTime() > now));
      if (sb) return { source: "system", expires_at: sb.expires_at };
      return null;
    },
    [bans, systemBans]
  );

  const pendingRequests = useMemo(() => joinRequests.filter((request) => request.status === "pending"), [joinRequests]);
  const pendingGuestRequests = useMemo(() => guests.filter((guest) => guest.approval_status === "pending"), [guests]);
  const approvedGuests = useMemo(() => guests.filter((guest) => guest.approval_status === "approved"), [guests]);
  const activePeladaBans = useMemo(
    () => bans.filter((ban) => ban.expires_at === null || new Date(ban.expires_at).getTime() > Date.now()),
    [bans]
  );
  const activeSystemBans = useMemo(
    () => systemBans.filter((ban) => ban.expires_at === null || new Date(ban.expires_at).getTime() > Date.now()),
    [systemBans]
  );

  const activeSystemBanUserIds = useMemo(() => new Set(activeSystemBans.map((b) => b.user_id)), [activeSystemBans]);

  const bannedUserIds = useMemo(() => {
    const set = new Set<string>();
    activePeladaBans.forEach((b) => set.add(b.user_id));
    activeSystemBans.forEach((b) => set.add(b.user_id));
    return set;
  }, [activePeladaBans, activeSystemBans]);

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

  const existingMemberUserIds = useMemo(() => {
    return new Set(members.map((member) => member.user_id));
  }, [members]);

  useEffect(() => {
    if (activeMenu !== "membros") return;

    const term = systemMemberSearch.trim();
    if (term.length < 2) {
      setSystemMemberResults([]);
      setIsSearchingSystemMembers(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingSystemMembers(true);

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .ilike("display_name", `%${term}%`)
        .limit(12);

      if (isCancelled) return;

      if (error) {
        setSystemMemberResults([]);
        setIsSearchingSystemMembers(false);
        return;
      }

      const filtered = (data || []).filter((profile) => !existingMemberUserIds.has(profile.user_id));
      setSystemMemberResults(filtered);
      setIsSearchingSystemMembers(false);
    }, 300);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeMenu, existingMemberUserIds, systemMemberSearch]);

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
    return buildOrderedPeladaEntries(pelada, members, approvedGuests);
  }, [approvedGuests, members, pelada]);

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
    return <PageState message="Pelada não encontrada" />;
  }

  if (forbidden) {
    return <PageState message="Você não tem permissão para administrar esta pelada." />;
  }

  if (!pelada) return null;

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${pelada.id}`);
    toast.success("Link copiado!");
  };

  const formatEntryName = (entry: PeladaListEntry) => {
    if (entry.kind === "member") return getMemberDisplayName(entry.member);
    const guestName: string = entry.guest.guest_name || "";
    const cleaned = guestName.replace(/\s*\(goleiro\)\s*$/i, "");
    const hostName = entry.hostMember ? getMemberDisplayName(entry.hostMember) : undefined;
    return hostName ? `${cleaned} (${hostName})` : cleaned;
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

    // Public link and confirmation instruction
    lines.push("");
    lines.push("CONFIRMAÇÕES PELO LINK:");
    lines.push(`${window.location.origin}/pelada/${pelada.id}`);
    lines.push("");
    lines.push("As confirmações devem ser feitas por esse link.");

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

  const reviewJoinRequest = async (request: JoinRequestRow, status: "approved" | "rejected") => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("pelada_join_requests")
      .update({ status, reviewed_by: user.id, reviewed_at: reviewedAt })
      .eq("id", request.id)
      .eq("status", "pending");

    if (error) {
      toast.error("Não foi possível revisar a solicitação");
      return;
    }

    if (status === "approved") {
      const profile = profilesByUserId[request.user_id];
      const memberName = request.display_name || profile?.display_name || "Jogador";

      const { error: upsertError } = await supabase.from("pelada_members").upsert(
        {
          pelada_id: request.pelada_id,
          user_id: request.user_id,
          member_name: memberName,
          member_avatar_url: profile?.avatar_url || null,
          is_goalkeeper: false,
        },
        { onConflict: "pelada_id,user_id" },
      );

      if (upsertError) {
        toast.error("Solicitação aprovada, mas não foi possível confirmar o membro automaticamente");
        fetchAll();
        return;
      }
    }

    toast.success(status === "approved" ? "Solicitação aprovada e membro confirmado" : "Solicitação recusada");
    fetchAll();
  };

  const reviewGuestRequest = async (guestId: string, status: "approved" | "rejected") => {
    const now = new Date().toISOString();
    const payload =
      status === "approved"
        ? {
            approval_status: "approved",
            approved_by: user.id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
          }
        : {
            approval_status: "rejected",
            rejected_by: user.id,
            rejected_at: now,
            approved_by: null,
            approved_at: null,
          };

    const { error } = await supabase
      .from("pelada_member_guests")
      .update(payload)
      .eq("id", guestId)
      .eq("approval_status", "pending");

    if (error) {
      toast.error("Não foi possível revisar o convidado");
      return;
    }

    toast.success(status === "approved" ? "Convidado aprovado" : "Convidado recusado");
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
    const guest = guests.find((row) => row.id === guestId);
    if (!guest) {
      toast.error("Convidado não encontrado");
      return;
    }

    const hostMember = members.find((row) => row.id === guest.pelada_member_id);
    if (!hostMember || hostMember.user_id !== user.id) {
      toast.error("Somente o responsável pode remover este convidado");
      return;
    }

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
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
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

  const addSystemMemberToPelada = async (profile: UserProfileRow) => {
    if (existingMemberUserIds.has(profile.user_id)) {
      toast.error("Esse usuário já está confirmado nesta pelada");
      return;
    }

    if (bannedUserIds.has(profile.user_id)) {
      toast.error("Esse usuário está banido e não pode ser adicionado");
      return;
    }

    setAddingSystemMemberUserId(profile.user_id);

    const { error } = await supabase.from("pelada_members").upsert(
      {
        pelada_id: pelada.id,
        user_id: profile.user_id,
        member_name: profile.display_name,
        member_avatar_url: profile.avatar_url,
        is_goalkeeper: false,
        admin_selected: true,
      },
      { onConflict: "pelada_id,user_id" }
    );

    setAddingSystemMemberUserId(null);

    if (error) {
      toast.error("Não foi possível adicionar o membro na pelada");
      return;
    }

    toast.success("Membro adicionado na pelada");
    setSystemMemberSearch("");
    setSystemMemberResults([]);
    fetchAll();
  };

  const banUser = async (targetUserId: string, permanent = false, applyToAll = false) => {
    let expiresAt: string | null = null;
    let reason = "";

    if (permanent) {
      expiresAt = null;
      reason = "Banimento permanente";
    } else {
      const days = Math.max(1, Math.floor(banDaysByUser[targetUserId] || 7));
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + days);
      expiresAt = expiresDate.toISOString();
      reason = `Banido por ${days} dia(s)`;
    }

    let error = null;
    if (applyToAll) {
      const res = await supabase.from("system_bans").upsert(
        {
          user_id: targetUserId,
          reason,
          banned_by: user.id,
          expires_at: expiresAt,
        },
        { onConflict: "user_id" }
      );
      error = res.error;
    } else {
      const res = await supabase.from("pelada_bans").upsert(
        {
          pelada_id: pelada.id,
          user_id: targetUserId,
          reason,
          banned_by: user.id,
          expires_at: expiresAt,
        },
        { onConflict: "pelada_id,user_id" }
      );
      error = res.error;
    }

    if (error) {
      if (applyToAll) {
        toast.error("Não foi possível aplicar banimento global (apenas super admins podem)");
      } else {
        toast.error("Não foi possível banir o usuário");
      }
      return;
    }

    if (applyToAll) {
      await Promise.all([
        supabase.from("pelada_members").delete().eq("user_id", targetUserId),
        supabase
          .from("pelada_join_requests")
          .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
          .eq("user_id", targetUserId),
      ]);
    } else {
      await Promise.all([
        supabase.from("pelada_members").delete().eq("pelada_id", pelada.id).eq("user_id", targetUserId),
        supabase
          .from("pelada_join_requests")
          .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
          .eq("pelada_id", pelada.id)
          .eq("user_id", targetUserId),
      ]);
    }

    toast.success(permanent ? "Usuário banido permanentemente" : reason);
    fetchAll();
  };

  const unbanUser = async (targetUserId: string, applyToAll = false) => {
    let error = null;
    if (applyToAll) {
      const res = await supabase.from("system_bans").delete().eq("user_id", targetUserId);
      error = res.error;
    } else {
      const res = await supabase.from("pelada_bans").delete().eq("pelada_id", pelada.id).eq("user_id", targetUserId);
      error = res.error;
    }

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

    // Busca o sorteio mais recente para evitar repetir companheiros de time.
    const { data: prevDrawData } = await supabase
      .from("peladas")
      .select("draw_result")
      .neq("id", pelada.id)
      .not("draw_done_at", "is", null)
      .order("draw_done_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevDraw = prevDrawData?.draw_result
      ? parseDrawResult(prevDrawData.draw_result as Json)
      : null;

    const normName = (n: string) => n.trim().toLowerCase();

    const previousTeammatePairs = new Set<string>();

    const pairKey = (a: string, b: string) => {
      const na = normName(a);
      const nb = normName(b);
      return na < nb ? `${na}::${nb}` : `${nb}::${na}`;
    };

    if (prevDraw) {
      for (const team of prevDraw) {
        for (let i = 0; i < team.players.length; i += 1) {
          for (let j = i + 1; j < team.players.length; j += 1) {
            previousTeammatePairs.add(pairKey(team.players[i], team.players[j]));
          }
        }
      }
    }

    const numTeams = pelada.num_teams;
    const baseSize = Math.floor(eligibleEntries.length / numTeams);
    const extraTeams = eligibleEntries.length % numTeams;
    const capacities = Array.from({ length: numTeams }, (_, idx) => (idx < extraTeams ? baseSize + 1 : baseSize));

    const createEmptyTeams = () =>
      Array.from({ length: numTeams }, (_, idx) => ({
        team: idx + 1,
        players: [] as string[],
      }));

    const countConflictsInTeam = (teamPlayers: string[], player: string) => {
      let conflicts = 0;
      for (const teammate of teamPlayers) {
        if (previousTeammatePairs.has(pairKey(teammate, player))) conflicts += 1;
      }
      return conflicts;
    };

    const countTotalConflicts = (candidateTeams: DrawTeam[]) => {
      let total = 0;
      for (const team of candidateTeams) {
        for (let i = 0; i < team.players.length; i += 1) {
          for (let j = i + 1; j < team.players.length; j += 1) {
            if (previousTeammatePairs.has(pairKey(team.players[i], team.players[j]))) {
              total += 1;
            }
          }
        }
      }
      return total;
    };

    const maxAttempts = 300;
    let bestTeams: DrawTeam[] | null = null;
    let bestConflicts = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const players = shuffle(eligibleEntries);
      const teams = createEmptyTeams();

      for (const playerName of players) {
        let bestScore = Number.POSITIVE_INFINITY;
        const bestCandidates: number[] = [];

        for (let teamIndex = 0; teamIndex < numTeams; teamIndex += 1) {
          if (teams[teamIndex].players.length >= capacities[teamIndex]) continue;

          const conflicts = countConflictsInTeam(teams[teamIndex].players, playerName);
          const load = teams[teamIndex].players.length;
          const score = conflicts * (eligibleEntries.length + 1) + load;

          if (score < bestScore) {
            bestScore = score;
            bestCandidates.length = 0;
            bestCandidates.push(teamIndex);
          } else if (score === bestScore) {
            bestCandidates.push(teamIndex);
          }
        }

        if (bestCandidates.length === 0) {
          continue;
        }

        const randomCandidate = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
        teams[randomCandidate].players.push(playerName);
      }

      const totalConflicts = countTotalConflicts(teams);

      if (totalConflicts < bestConflicts) {
        bestConflicts = totalConflicts;
        bestTeams = teams;
      }

      if (bestConflicts === 0) break;
    }

    const teams = bestTeams || createEmptyTeams();

    const { error } = await supabase
      .from("peladas")
      .update({
        draw_done_at: new Date().toISOString(),
        draw_result: teams,
        draw_done_by: user.id,
      })
      .eq("id", pelada.id)
      .is("draw_done_at", null);

    if (error) {
      toast.error("Não foi possível concluir o sorteio");
      return;
    }

    if (bestConflicts > 0) {
      toast.success(`Sorteio realizado com ${bestConflicts} repetição(ões) inevitável(is) de parceria.`);
    } else {
      toast.success("Sorteio realizado com sucesso sem repetir parcerias da última pelada!");
    }
    fetchAll();
  };

  const exportDraw = async () => {
    if (!pelada || !pelada.draw_done_at || !Array.isArray(pelada.draw_result)) {
      toast.error("Nenhum sorteio registrado");
      return;
    }

    let adminName = pelada.draw_done_by || "Desconhecido";
    if (pelada.draw_done_by && profilesByUserId[pelada.draw_done_by]?.display_name) {
      adminName = profilesByUserId[pelada.draw_done_by].display_name;
    } else if (pelada.draw_done_by) {
      try {
        const { data: profile } = await supabase.from("user_profiles").select("display_name").eq("user_id", pelada.draw_done_by).maybeSingle();
        if (profile?.display_name) adminName = profile.display_name;
      } catch (e) {
        // ignore
      }
    }

    const lines: string[] = [];
    lines.push(`SORTEIO OFICIAL - ${pelada.title}`);
    lines.push("");
    lines.push("O sorteio foi realizado apenas uma vez.");
    lines.push("");
    lines.push(`Realizado em: ${formatDateTimeBrasiliaWithSeconds(pelada.draw_done_at)}`);
    lines.push(`Realizado por: ${adminName}`);
    lines.push("");

    pelada.draw_result.forEach((team) => {
      lines.push(`Time ${team.team}:`);
      team.players.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    });

    lines.push(`CONFIRMAÇÕES PELO LINK:`);
    lines.push(`${window.location.origin}/pelada/${pelada.id}`);

    const finalText = lines.join("\n");

    try {
      await navigator.clipboard.writeText(finalText);
      toast.success("Sorteio copiado — cole no WhatsApp");
    } catch (e) {
      toast.error("Falha ao copiar sorteio");
    }
  };

  const formatOpenAt = () => {
    try {
      return `${formatWeekdayDateTimeBrasilia(pelada.confirmations_open_at)} (horário de Brasília)`;
    } catch {
      return pelada.confirmations_open_at;
    }
  };

  const totalConfiguredPlayers = Math.max(0, editNumTeams) * Math.max(0, editPlayersPerTeam);
  const totalCurrentConfirmed = members.length + approvedGuests.length;
  const mobileNavItems: Array<{ key: AdminMenu; label: string; icon: typeof Settings }> = [
    { key: "config", label: "Config", icon: Settings },
    { key: "lista", label: "Lista", icon: List },
    { key: "historico", label: "Hist", icon: Clock },
    { key: "membros", label: "Membros", icon: Users },
    { key: "queridometro", label: "Qmetro", icon: Heart },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={pelada.title}
        subtitle="Painel administrativo"
        backTo="/"
      />

      <main className="container mx-auto space-y-4 px-4 py-6 pb-28 lg:pb-6">
        <div className="hidden lg:block">
          <AdminTabs
            active={activeMenu}
            onChange={setActiveMenu}
            pendingCount={pendingRequests.length + pendingGuestRequests.length}
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 to-card p-4">
          <h2 className="mb-2 font-display text-lg text-primary">AÇÕES RÁPIDAS</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleDraw} className="gap-2" disabled={!!pelada.draw_done_at || eligibleEntries.length === 0}>
              <Shuffle className="h-4 w-4" /> {pelada.draw_done_at ? "Sorteio já realizado" : "Fazer sorteio oficial"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pelada.draw_done_at
                ? "Esse sorteio é único e não pode ser refeito."
                : "Disponível para admin e admin supremo; evita repetir parcerias da última pelada quando possível."}
            </p>
          </div>
        </div>

        <div key={activeMenu} className="animate-fade-in">
        {activeMenu === "config" && (
        <>
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-2 font-display text-lg text-primary">ABERTURA DAS CONFIRMAÇÕES</h2>
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-2 font-display text-lg text-primary">PRIORIDADE DA LISTA</h2>
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-2 font-display text-lg text-primary">REGRAS CONFIGURÁVEIS</h2>
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
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-primary">HISTÓRICO DE PARTICIPAÇÃO</h2>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportTimelineCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="space-y-2">
            {timelineEvents.length === 0 && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Sem eventos registrados ainda.</p>
            )}

            {timelineEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-border/60 bg-secondary/15 p-2">
                <p className="text-sm text-foreground">{event.message}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeBrasilia(event.at)} (Brasília)</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {activeMenu === "lista" && (
        <>
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">SOLICITAÇÕES DE ENTRADA</h2>
          <p className="mb-3 text-xs text-muted-foreground">Admins da pelada aprovam ou recusam. Banidos não podem ser aprovados.</p>

          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-2 transition-colors hover:bg-secondary/40">
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
                    <Button size="sm" onClick={() => reviewJoinRequest(request, "approved")} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reviewJoinRequest(request, "rejected")}
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-2 font-display text-lg text-primary">ADICIONAR PESSOA EXTERNA (APENAS ADMIN)</h2>
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">SOLICITAÇÕES DE CONVIDADOS</h2>
          <p className="mb-3 text-xs text-muted-foreground">Convidados adicionados por membros entram na lista apenas após aprovação de admin.</p>

          <div className="space-y-2">
            {pendingGuestRequests.map((guest) => {
              const hostMember = members.find((member) => member.id === guest.pelada_member_id);
              const hostName = hostMember ? getMemberDisplayName(hostMember) : "responsável removido";

              return (
                <div key={guest.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-2 transition-colors hover:bg-secondary/40">
                  <div>
                    <p className="text-sm text-foreground">{guest.guest_name}</p>
                    <p className="text-xs text-muted-foreground">Responsável: {hostName}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => reviewGuestRequest(guest.id, "approved")} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reviewGuestRequest(guest.id, "rejected")} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Recusar
                    </Button>
                  </div>
                </div>
              );
            })}

            {pendingGuestRequests.length === 0 && (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem convidados pendentes</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">ADMINS DELEGADOS</h2>

          <div className="space-y-2">
            {adminCandidates.map((candidate) => {
              const memberIsOwner = candidate.isOwner;
              const memberIsAdmin = adminUserIds.has(candidate.userId);

              return (
                <div key={`admin-${candidate.userId}`} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-2 transition-colors hover:bg-secondary/40">
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">SELEÇÃO PARA O JOGO</h2>
          <p className="mb-3 text-xs text-muted-foreground">Participantes e convidados aprovados aparecem na lista. Goleiros não entram no sorteio.</p>

          <div className="mb-3 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            Confirmados no total: <span className="font-semibold text-foreground">{totalCurrentConfirmed}</span> | Elegíveis para sorteio: <span className="font-semibold text-foreground">{eligibleEntries.length}</span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button onClick={handleDraw} className="gap-2" disabled={!!pelada.draw_done_at || eligibleEntries.length === 0}>
              <Shuffle className="h-4 w-4" /> {pelada.draw_done_at ? "Sorteio já realizado" : "Fazer sorteio oficial"}
            </Button>
            {pelada.draw_done_at ? (
              <p className="text-xs text-muted-foreground">Esse sorteio é único e já foi concluído.</p>
            ) : (
              <p className="text-xs text-muted-foreground">O sorteio considera a última pelada para evitar repetir parcerias.</p>
            )}
          </div>

          <div className="space-y-2">
            {orderedListEntries.map((entry) => {
              if (entry.kind === "member") {
                const member = entry.member;

                return (
                  <div key={member.id} className="rounded-lg border border-border/60 bg-secondary/20 p-2 transition-colors hover:bg-secondary/40">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-foreground">
                        {getMemberDisplayName(member)}
                        {entry.isGoalkeeper ? " (goleiro)" : ""}
                        {entry.isWaiting ? " (espera)" : ""}
                        {bannedUserIds.has(member.user_id) ? " (banido)" : ""}
                        {member.is_automatic_entry ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                            Automático
                          </span>
                        ) : null}
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => deleteMember(member.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-8 w-20"
                        placeholder="Prioridade"
                        value={member.priority_score}
                        onChange={(e) => updateMemberPriority(member.id, Number(e.target.value || 0))}
                      />
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        className="h-8 w-20"
                        placeholder="Dias ban"
                        value={banDaysByUser[member.user_id] || 7}
                        onChange={(e) =>
                          setBanDaysByUser((prev) => ({
                            ...prev,
                            [member.user_id]: Number(e.target.value || 1),
                          }))
                        }
                        disabled={!!banPermanentByUser[member.user_id]}
                      />
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!!banPermanentByUser[member.user_id]}
                          onChange={(e) =>
                            setBanPermanentByUser((prev) => ({
                              ...prev,
                              [member.user_id]: e.target.checked,
                            }))
                          }
                        />
                        Permanente
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!!banApplyAllByUser[member.user_id]}
                          onChange={(e) =>
                            setBanApplyAllByUser((prev) => ({
                              ...prev,
                              [member.user_id]: e.target.checked,
                            }))
                          }
                          disabled={!isSuperAdmin}
                        />
                        Todas peladas
                      </label>
                      {bannedUserIds.has(member.user_id) ? (
                        <Button variant="outline" size="sm" onClick={() => unbanUser(member.user_id, !!activeSystemBanUserIds.has(member.user_id))}>
                          Desbanir
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => banUser(member.user_id, !!banPermanentByUser[member.user_id], !!banApplyAllByUser[member.user_id])}
                        >
                          {banPermanentByUser[member.user_id] ? "Banir permanentemente" : "Banir dias"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }

              const guest = entry.guest;
              const canDeleteGuest = !!entry.hostMember && entry.hostMember.user_id === user.id;

              return (
                <div key={guest.id} className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      {guest.guest_name}
                      {guest.admin_selected ? " (externo via admin)" : " (convidado)"}
                      {guest.approval_status === "approved" ? " (aprovado)" : ""}
                      {entry.isWaiting ? " (espera)" : ""}
                    </span>
                    {canDeleteGuest ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteGuest(guest.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vinculado a: {entry.hostMember ? getMemberDisplayName(entry.hostMember) : "participante removido"}
                  </p>
                </div>
              );
            })}

            {members.length === 0 && approvedGuests.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sem confirmações ainda</p>}
          </div>
        </div>
        </>
        )}

        {activeMenu === "membros" && (
        <>
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">ADICIONAR MEMBRO DO SISTEMA</h2>
          <p className="mb-3 text-xs text-muted-foreground">Busque por nome e adicione o usuário diretamente nesta pelada.</p>

          <div className="space-y-3">
            <Input
              placeholder="Digite pelo menos 2 letras do nome"
              value={systemMemberSearch}
              onChange={(e) => setSystemMemberSearch(e.target.value)}
            />

            {systemMemberSearch.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres para buscar.</p>
            ) : isSearchingSystemMembers ? (
              <p className="text-xs text-muted-foreground">Buscando membros do sistema...</p>
            ) : systemMemberResults.length === 0 ? (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Nenhum usuário encontrado para adicionar</p>
            ) : (
              <div className="space-y-2">
                {systemMemberResults.map((profile) => {
                  const isBanned = bannedUserIds.has(profile.user_id);
                  const isAdding = addingSystemMemberUserId === profile.user_id;

                  return (
                    <div key={profile.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 transition-colors hover:bg-secondary/40">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{profile.display_name}</p>
                        <p className="truncate text-xs text-muted-foreground">ID: {profile.user_id}</p>
                      </div>

                      <Button size="sm" onClick={() => addSystemMemberToPelada(profile)} disabled={isBanned || isAdding}>
                        {isBanned ? "Banido" : isAdding ? "Adicionando..." : "Adicionar"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">SOLICITAÇÕES PENDENTES</h2>
          <p className="mb-3 text-xs text-muted-foreground">Aprovações e recusas de entrada na pelada.</p>

          {pendingRequests.length === 0 ? (
            <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Sem solicitações pendentes</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3 transition-colors hover:bg-secondary/40">
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
                        <Button size="sm" onClick={() => reviewJoinRequest(request, "approved")} className="gap-1">
                          <Check className="h-3.5 w-3.5" /> Aprovar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => reviewJoinRequest(request, "rejected")}
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

        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-3 font-display text-lg text-primary">MEMBROS CONFIRMADOS</h2>
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
                  <div key={member.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3 transition-colors hover:bg-secondary/40">
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
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in">
          <h2 className="mb-2 font-display text-lg text-primary">QUERIDÔMETRO (EM CONSTRUÇÃO)</h2>
          <p className="mb-3 text-sm text-muted-foreground">Módulo reservado para implementação futura.</p>
          <div className="space-y-2 rounded-md bg-secondary/30 p-3 text-sm text-muted-foreground">
            <p>- Registro de gols, assistências e defesas por jogador.</p>
            <p>- Opção de validação pelo admin ou auto-registro sem validação.</p>
            <p>- Votação de experiência por jogador de 1 a 5 estrelas.</p>
          </div>
        </div>
        )}
        </div>

        {pelada.draw_done_at && Array.isArray(pelada.draw_result) && (
          <div className="rounded-lg border border-accent/30 bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="mb-2 font-display text-lg text-accent">RESULTADO OFICIAL (UNICO)</h2>
              <div>
                <Button onClick={exportDraw} size="sm" className="gap-2">
                  <Download className="h-4 w-4" /> Copiar sorteio
                </Button>
              </div>
            </div>
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

        <MobileSectionNav
          items={mobileNavItems}
          activeKey={activeMenu}
          onChange={(key) => setActiveMenu(key as AdminMenu)}
        />
      </main>
    </div>
  );
};

export default AdminPelada;
