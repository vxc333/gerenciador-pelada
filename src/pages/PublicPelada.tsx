import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateBrasiliaLong, formatWeekdayDateTimeBrasilia, formatDateTimeBrasiliaWithSeconds } from "@/lib/datetime-br";
import { buildOrderedPeladaEntries, type PeladaListEntry } from "@/lib/pelada-participants";
import { getPeladaRules } from "@/lib/pelada-rules";
import { PublicPeladaHeader } from "@/components/pelada/public/PublicPeladaHeader";
import { PublicPeladaAccessCard } from "@/components/pelada/public/PublicPeladaAccessCard";
import { PublicPeladaConfirmationCard } from "@/components/pelada/public/PublicPeladaConfirmationCard";
import { PublicPeladaGuestsCard } from "@/components/pelada/public/PublicPeladaGuestsCard";
import {
  PublicPeladaPendingGuestsCard,
  PublicPeladaSystemMemberCard,
} from "@/components/pelada/public/PublicPeladaAdminCards";
import { PublicPeladaParticipantsCard } from "@/components/pelada/public/PublicPeladaParticipantsCard";
import { PublicPeladaDrawCard } from "@/components/pelada/public/PublicPeladaDrawCard";
import { parseDrawResult } from "@/components/pelada/public/utils";
import { PageState } from "@/components/layout/PageState";
import type {
  GuestRow,
  JoinRequestRow,
  MemberRow,
  PeladaRow,
  UserProfileRow,
} from "@/components/pelada/public/types";

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
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfileRow>>({});
  const [isDelegatedAdmin, setIsDelegatedAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAutomaticMember, setIsAutomaticMember] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [rules, setRules] = useState(getPeladaRules(""));
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [systemMemberSearch, setSystemMemberSearch] = useState("");
  const [systemMemberResults, setSystemMemberResults] = useState<UserProfileRow[]>([]);
  const [isSearchingSystemMembers, setIsSearchingSystemMembers] = useState(false);
  const [addingSystemMemberUserId, setAddingSystemMemberUserId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null);

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
        const [{ count: joinCount }, { count: guestCount }] = await Promise.all([
          supabase
            .from("pelada_join_requests")
            .select("*", { count: "exact", head: true })
            .eq("pelada_id", id)
            .eq("status", "pending"),
          supabase
            .from("pelada_member_guests")
            .select("*", { count: "exact", head: true })
            .eq("pelada_id", id)
            .eq("approval_status", "pending"),
        ]);

        setPendingRequestsCount((joinCount || 0) + (guestCount || 0));
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

    const memberIds = (membersData || []).filter((m) => !m.admin_selected).map((m) => m.user_id);
    if (memberIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", memberIds);
      const map: Record<string, UserProfileRow> = {};
      (profilesData || []).forEach((p) => { map[p.user_id] = p; });
      setProfilesByUserId(map);
    } else {
      setProfilesByUserId({});
    }
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
  const canManagePelada = !!user && !!pelada && (pelada.user_id === user.id || isDelegatedAdmin || isSuperAdmin);
  const existingMemberUserIds = useMemo(() => new Set(members.map((member) => member.user_id)), [members]);
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
    if (!canManagePelada) {
      setSystemMemberResults([]);
      setIsSearchingSystemMembers(false);
      return;
    }

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
  }, [canManagePelada, existingMemberUserIds, systemMemberSearch]);

  useEffect(() => {
    // Auto-confirm: admins (owner or delegated) BUT NOT super admins
    const autoEnroll = async () => {
      // Evita re-adicionar automaticamente se o servidor registrar uma saída recente
      try {
        if (pelada && user) {
          const SKIP_MS = 72 * 60 * 60 * 1000; // 72h
          const { data: leaveRow, error: leaveError } = await supabase
            .from("pelada_recent_leaves")
            .select("left_at")
            .eq("pelada_id", pelada.id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (leaveError) {
            console.error("Erro checando pelada_recent_leaves:", leaveError);
          } else if (leaveRow && leaveRow.left_at) {
            const leftTs = new Date(leaveRow.left_at).getTime();
            if (Date.now() - leftTs < SKIP_MS) {
              return;
            } else {
              // cleanup: remove registro antigo do servidor
              await supabase.from("pelada_recent_leaves").delete().eq("pelada_id", pelada.id).eq("user_id", user.id);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }

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
      toast.error("Preencha seu nome para confirmar presença na pelada");
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
    // Tenta remover por pelada_id + user_id para cobrir duplicatas; retorna linhas removidas
    const { data, error } = await supabase
      .from("pelada_members")
      .delete()
      .select("id")
      .eq("pelada_id", pelada!.id)
      .eq("user_id", user!.id);

    if (error) {
      toast.error("Não foi possível remover sua confirmação");
      console.error("Erro removendo pelada_members:", error);
      return;
    }

    if (!data || data.length === 0) {
      toast.error("Não foi possível remover sua confirmação");
      return;
    }

    // Registra no servidor que o usuário saiu desta pelada (evita auto-reconfirmação)
    try {
      const { error: upsertError } = await supabase.from("pelada_recent_leaves").upsert(
        [
          {
            pelada_id: pelada!.id,
            user_id: user!.id,
            left_at: new Date().toISOString(),
          },
        ],
        { onConflict: "pelada_id,user_id" },
      );
      if (upsertError) console.error("Erro registrando pelada_recent_leaves:", upsertError);
    } catch (e) {
      console.error("Erro ao gravar pelada_recent_leaves:", e);
    }

    toast.success("Sua confirmação foi removida");
    fetchAll();
  };

  const handleAddGuest = async () => {
    if (!pelada || !user) {
      toast.error("Faça login para adicionar convidado");
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

    let activeMember = myMember;

    if (!activeMember) {
      if (!preferredMemberName) {
        toast.error("Complete seu perfil com nome antes de adicionar convidado");
        return;
      }

      const { data: upsertedMember, error: ensureMemberError } = await supabase
        .from("pelada_members")
        .upsert(
          {
            pelada_id: pelada.id,
            user_id: user.id,
            member_name: preferredMemberName,
            member_avatar_url: myProfile?.avatar_url || null,
            is_goalkeeper: false,
          },
          { onConflict: "pelada_id,user_id" },
        )
        .select("*")
        .single();

      if (ensureMemberError || !upsertedMember) {
        toast.error("Não foi possível confirmar sua presença antes de adicionar convidado");
        return;
      }

      activeMember = upsertedMember;
      setMembers((prev) => {
        const withoutCurrent = prev.filter((member) => member.id !== upsertedMember.id);
        return [...withoutCurrent, upsertedMember];
      });
    }

    const trimmed = guestName.trim();
    if (!trimmed) {
      toast.error("Informe o nome do convidado");
      return;
    }

    const myGuestCount = guests.filter((guest) => guest.pelada_member_id === activeMember.id).length;
    if (myGuestCount >= rules.maxGuestsPerMember) {
      toast.error(`Limite de convidados atingido (${rules.maxGuestsPerMember})`);
      return;
    }

    const finalGuestName = isGuestGoalkeeper ? `${trimmed} (goleiro)` : trimmed;

    const { error } = await supabase.from("pelada_member_guests").insert({
      pelada_id: pelada.id,
      pelada_member_id: activeMember.id,
      guest_name: finalGuestName,
      approval_status: "pending",
    });

    if (error) {
      console.error("Erro adicionando convidado:", error);

      if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
        toast.error("Sem permissão para adicionar convidado nesta pelada");
      } else {
        toast.error(`Não foi possível adicionar convidado: ${error.message}`);
      }
      return;
    }

    setGuestName("");
    setIsGuestGoalkeeper(false);
    toast.success("Convidado enviado para aprovação dos admins");
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

  const handleAdminRemoveMember = async (member: MemberRow) => {
    if (!pelada || !canManagePelada || !user) {
      toast.error("Você não tem permissão para remover membros");
      return;
    }

    if (member.user_id === user.id) {
      toast.error("Use o botão de remover minha confirmação para sair da lista");
      return;
    }

    setRemovingMemberId(member.id);

    const { error } = await supabase
      .from("pelada_members")
      .delete()
      .eq("pelada_id", pelada.id)
      .eq("user_id", member.user_id);

    setRemovingMemberId(null);

    if (error) {
      toast.error("Não foi possível remover o membro");
      return;
    }

    toast.success("Membro removido da lista");
    fetchAll();
  };

  const handleMoveEntry = async (entry: PeladaListEntry, toWaiting: boolean) => {
    if (!canManagePelada || !pelada) {
      toast.error("Você não tem permissão para mover participantes");
      return;
    }

    const moveUsesHostRole =
      entry.kind === "guest" &&
      pelada.guest_priority_mode === "grouped_with_member" &&
      !entry.isGoalkeeper;
    const roleIsGoalkeeper = moveUsesHostRole && entry.hostMember ? entry.hostMember.is_goalkeeper : entry.isGoalkeeper;

    if (!toWaiting) {
      const activeCountInRole = orderedListEntries.filter(
        (currentEntry) => !currentEntry.isWaiting && currentEntry.isGoalkeeper === roleIsGoalkeeper,
      ).length;
      const roleCapacity = roleIsGoalkeeper ? pelada.max_goalkeepers : pelada.max_players;

      if (activeCountInRole >= roleCapacity) {
        toast.error(
          roleIsGoalkeeper
            ? `Lista principal de goleiros cheia (${activeCountInRole}/${roleCapacity})`
            : `Lista principal de jogadores cheia (${activeCountInRole}/${roleCapacity})`,
        );
        return;
      }
    }

    const entryId = `${entry.kind}-${entry.id}`;
    setMovingEntryId(entryId);

    const forceRebalance = async () => {
      const { error } = await supabase.rpc("rebalance_pelada_waitlist", { p_pelada_id: pelada.id });
      if (error) {
        console.error("Erro ao recalcular lista de espera:", error);
      }
    };

    const buildMemberMovePatch = (isGoalkeeperRole: boolean) => {
      const patch: { is_waiting: boolean; priority_score?: number; created_at?: string } = { is_waiting: toWaiting };

      if (pelada.list_priority_mode === "member_priority") {
        const roleScores = members
          .filter((m) => m.is_goalkeeper === isGoalkeeperRole)
          .map((m) => m.priority_score);
        const minScore = roleScores.length > 0 ? Math.min(...roleScores) : 0;
        const maxScore = roleScores.length > 0 ? Math.max(...roleScores) : 0;
        patch.priority_score = toWaiting ? minScore - 1 : maxScore + 1;
        return patch;
      }

      const approvedGuestsNow = guests.filter((g) => g.approval_status === "approved");
      const isGuestGoalkeeper = (name: string) => /\(goleiro\)\s*$/i.test(name);

      const roleTimestamps = [
        ...members.filter((m) => m.is_goalkeeper === isGoalkeeperRole).map((m) => new Date(m.created_at).getTime()),
        ...approvedGuestsNow
          .filter((g) => isGuestGoalkeeper(g.guest_name) === isGoalkeeperRole)
          .map((g) => new Date(g.created_at).getTime()),
      ].filter((value) => Number.isFinite(value));

      const nowMs = Date.now();
      const earliestMs = roleTimestamps.length > 0 ? Math.min(...roleTimestamps) : nowMs;
      const latestMs = roleTimestamps.length > 0 ? Math.max(...roleTimestamps) : nowMs;
      const shiftedMs = toWaiting ? latestMs + 1000 : earliestMs - 1000;

      patch.created_at = new Date(shiftedMs).toISOString();
      return patch;
    };

    if (entry.kind === "member") {
      const { data, error } = await supabase
        .from("pelada_members")
        .update(buildMemberMovePatch(entry.isGoalkeeper))
        .eq("id", entry.member.id)
        .eq("pelada_id", pelada.id)
        .select("id, is_waiting")
        .maybeSingle();

      setMovingEntryId(null);

      if (error) {
        toast.error("Não foi possível mover o membro");
        return;
      }

      if (!data) {
        toast.error("Movimentação não aplicada. Verifique suas permissões de admin nesta pelada.");
        return;
      }

      if (data.is_waiting !== toWaiting) {
        toast.error("Não foi possível persistir a movimentação do membro");
        fetchAll();
        return;
      }

      await forceRebalance();

      toast.success(toWaiting ? "Membro movido para a lista de espera" : "Membro movido para a lista principal");
      fetchAll();
      return;
    }

    if (moveUsesHostRole) {
      if (!entry.hostMember) {
        setMovingEntryId(null);
        toast.error("Convidado sem responsável ativo não pode ser movido diretamente.");
        return;
      }

      const { data, error } = await supabase
        .from("pelada_members")
        .update(buildMemberMovePatch(entry.hostMember.is_goalkeeper))
        .eq("id", entry.hostMember.id)
        .eq("pelada_id", pelada.id)
        .select("id, is_waiting")
        .maybeSingle();

      setMovingEntryId(null);

      if (error) {
        toast.error("Não foi possível mover o responsável do convidado");
        return;
      }

      if (!data) {
        toast.error("Movimentação não aplicada. Verifique suas permissões de admin nesta pelada.");
        return;
      }

      if (data.is_waiting !== toWaiting) {
        toast.error("Não foi possível persistir a movimentação do responsável");
        fetchAll();
        return;
      }

      await forceRebalance();

      toast.success(
        toWaiting
          ? "Responsável do convidado movido para a lista de espera"
          : "Responsável do convidado movido para a lista principal",
      );
      fetchAll();
      return;
    }

    const { data, error } = await supabase
      .from("pelada_member_guests")
      .update({
        is_waiting: toWaiting,
        created_at: new Date(Date.now() + (toWaiting ? 1000 : -1000)).toISOString(),
      })
      .eq("id", entry.guest.id)
      .eq("pelada_id", pelada.id)
      .select("id, is_waiting")
      .maybeSingle();

    setMovingEntryId(null);

    if (error) {
      toast.error("Não foi possível mover o convidado");
      return;
    }

    if (!data) {
      toast.error("Movimentação não aplicada. Verifique suas permissões de admin nesta pelada.");
      return;
    }

    if (data.is_waiting !== toWaiting) {
      toast.error("Não foi possível persistir a movimentação do convidado");
      fetchAll();
      return;
    }

    await forceRebalance();

    toast.success(toWaiting ? "Convidado movido para a lista de espera" : "Convidado movido para a lista principal");
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

  const addSystemMemberToPelada = async (profile: UserProfileRow) => {
    if (!pelada || !canManagePelada) return;

    if (existingMemberUserIds.has(profile.user_id)) {
      toast.error("Esse usuário já está confirmado nesta pelada");
      return;
    }

    const nowIso = new Date().toISOString();
    const [{ data: peladaBan }, { data: systemBan }] = await Promise.all([
      supabase
        .from("pelada_bans")
        .select("id")
        .eq("pelada_id", pelada.id)
        .eq("user_id", profile.user_id)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle(),
      supabase
        .from("system_bans")
        .select("id")
        .eq("user_id", profile.user_id)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .maybeSingle(),
    ]);

    if (peladaBan || systemBan) {
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

  const reviewGuestRequest = async (guestId: string, status: "approved" | "rejected") => {
    if (!canManagePelada || !user) return;

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

  const approvedGuests = useMemo(() => guests.filter((guest) => guest.approval_status === "approved"), [guests]);
  const pendingGuestRequests = useMemo(() => guests.filter((guest) => guest.approval_status === "pending"), [guests]);

  const myGuests = useMemo(() => {
    if (!myMember) return [];
    return guests.filter((guest) => guest.pelada_member_id === myMember.id);
  }, [guests, myMember]);

  const orderedListEntries = useMemo(() => {
    if (!pelada) return [];
    return buildOrderedPeladaEntries(pelada, members, approvedGuests);
  }, [approvedGuests, members, pelada]);

  const memberCapacity = pelada?.max_players || 0;
  const gkCapacity = pelada?.max_goalkeepers || 0;

  const memberCount = orderedListEntries.filter((entry) => !entry.isGoalkeeper && !entry.isWaiting).length;
  const gkCount = orderedListEntries.filter((entry) => entry.isGoalkeeper && !entry.isWaiting).length;
  const waitingEntries = useMemo(() => orderedListEntries.filter((entry) => entry.isWaiting), [orderedListEntries]);
  const disableConfirmButton = !canConfirm || isBanned || (!isAdmin && !memberName.trim());
  const canAddGuest = !!myMember && (canConfirm || isAdmin) && !isBanned;
  const publicLink = `${window.location.origin}/pelada/${pelada?.id ?? id}`;

  const myWaitingPosition = useMemo(() => {
    if (!myMember?.is_waiting) return 0;
    const waitingQueue = waitingEntries.filter((entry) => entry.isGoalkeeper === myMember.is_goalkeeper);
    return waitingQueue.findIndex((entry) => entry.kind === "member" && entry.member.id === myMember.id) + 1;
  }, [myMember, waitingEntries]);

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(`/pelada/${id}`)}`} replace />;
  if (!hasProfileName) return <Navigate to="/?complete-profile=1" replace />;

  if (notFound) {
    return <PageState message="Pelada não encontrada" />;
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

  const getMemberDisplayName = (member: MemberRow) => {
    if (member.admin_selected) return member.member_name;
    return profilesByUserId[member.user_id]?.display_name || member.member_name;
  };

  const formatEntryName = (entry: PeladaListEntry) => {
    if (entry.kind === "member") return getMemberDisplayName(entry.member);
    const guestName: string = entry.guest.guest_name || "";
    const cleaned = guestName.replace(/\s*\(goleiro\)\s*$/i, "");
    const host = entry.hostMember ? getMemberDisplayName(entry.hostMember) : undefined;
    return host ? `${cleaned} (${host})` : cleaned;
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
    const waitList = orderedListEntries.filter((e) => e.isWaiting).map((e) => {
      if (e.kind === "member") return getMemberDisplayName(e.member);
      const name = e.guest.guest_name.replace(/\s*\(goleiro\)\s*$/i, "");
      const host = e.hostMember ? getMemberDisplayName(e.hostMember) : undefined;
      return host ? `${name} (${host})` : name;
    });

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

  const exportDraw = async () => {
    if (!pelada || !pelada.draw_done_at || !Array.isArray(pelada.draw_result)) {
      toast.error("Nenhum sorteio registrado");
      return;
    }

    let adminName = pelada.draw_done_by || "Desconhecido";
    try {
      if (pelada.draw_done_by) {
        const { data: profile } = await supabase.from("user_profiles").select("display_name").eq("user_id", pelada.draw_done_by).maybeSingle();
        if (profile?.display_name) adminName = profile.display_name;
      }
    } catch (e) {
      // ignore
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

  return (
    <div className="min-h-screen bg-background">
      <PublicPeladaHeader
        peladaId={pelada.id}
        title={pelada.title}
        location={pelada.location}
        time={pelada.time}
        gameDateLabel={formatGameDate()}
        canManagePelada={canManagePelada}
        pendingRequestsCount={pendingRequestsCount}
      />

      <main className="container mx-auto max-w-md space-y-5 px-4 py-6 sm:px-6 sm:py-7">
        {isBanned && (
          <div className="rounded-xl border border-destructive/40 bg-card p-5">
            <p className="text-sm text-destructive">Você está banido desta pelada.</p>
          </div>
        )}

        <PublicPeladaAccessCard
          isBanned={isBanned}
          canAccessPelada={canAccessPelada}
          profileHasName={profileHasName}
          myJoinRequest={myJoinRequest}
          onRequestAccess={handleRequestAccess}
        />

        <PublicPeladaConfirmationCard
          canConfirm={canConfirm}
          formatOpenAtLabel={formatOpenAt()}
          showProgressiveWarning={showProgressiveWarning}
          progressiveWarningHours={rules.progressiveWarningHours}
          isAdmin={isAdmin}
          memberName={memberName}
          onMemberNameChange={setMemberName}
          isGoalkeeper={isGoalkeeper}
          onGoalkeeperChange={setIsGoalkeeper}
          onConfirm={handleConfirmMe}
          onRemove={handleRemoveMe}
          hasMember={!!myMember}
          isBanned={isBanned}
          disableConfirm={disableConfirmButton}
          myMemberIsWaiting={!!myMember?.is_waiting}
          myWaitingPosition={myWaitingPosition}
        />

        <PublicPeladaGuestsCard
          maxGuestsPerMember={rules.maxGuestsPerMember}
          guestName={guestName}
          onGuestNameChange={setGuestName}
          onGuestKeyDown={(key) => key === "Enter" && handleAddGuest()}
          onAddGuest={handleAddGuest}
          isGuestGoalkeeper={isGuestGoalkeeper}
          onGuestGoalkeeperChange={setIsGuestGoalkeeper}
          hasMember={!!myMember}
          canAddGuest={canAddGuest}
          myGuests={myGuests}
          onRemoveGuest={handleRemoveGuest}
        />

        {canManagePelada && (
          <PublicPeladaSystemMemberCard
            systemMemberSearch={systemMemberSearch}
            onSystemMemberSearchChange={setSystemMemberSearch}
            isSearchingSystemMembers={isSearchingSystemMembers}
            systemMemberResults={systemMemberResults}
            addingSystemMemberUserId={addingSystemMemberUserId}
            onAddSystemMember={addSystemMemberToPelada}
          />
        )}

        {canManagePelada && (
          <PublicPeladaPendingGuestsCard
            pendingGuestRequests={pendingGuestRequests}
            members={members}
            getMemberDisplayName={getMemberDisplayName}
            onReviewGuest={reviewGuestRequest}
          />
        )}

        <PublicPeladaParticipantsCard
          pelada={pelada}
          memberCount={memberCount}
          memberCapacity={memberCapacity}
          gkCount={gkCount}
          gkCapacity={gkCapacity}
          approvedGuestsCount={approvedGuests.length}
          waitingEntriesCount={waitingEntries.length}
          orderedListEntries={orderedListEntries}
          isAdmin={isAdmin}
          canManagePelada={canManagePelada}
          currentUserId={user?.id}
          currentUserMemberId={myMember?.id}
          movingEntryId={movingEntryId}
          removingMemberId={removingMemberId}
          publicLink={publicLink}
          onCopyFormattedList={copyFormattedList}
          onCopyPublicLink={() => {
            navigator.clipboard.writeText(publicLink).then(() => toast.success("Link copiado!")).catch(() => toast.error("Falha ao copiar link"));
          }}
          onMoveEntry={handleMoveEntry}
          onAdminRemoveMember={handleAdminRemoveMember}
          onRemoveGuest={handleRemoveGuest}
          getMemberDisplayName={getMemberDisplayName}
        />

        {pelada.draw_done_at && (
          <PublicPeladaDrawCard isAdmin={isAdmin} drawResult={pelada.draw_result} onExportDraw={exportDraw} />
        )}
      </main>
    </div>
  );
};

export default PublicPelada;
