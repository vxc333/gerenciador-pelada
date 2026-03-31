import { useState, useEffect, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  UserPlus,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type PeladaRow = Tables<"peladas">;
type JoinRequestStatus = Tables<"pelada_join_requests">["status"];

interface PeladaCard extends PeladaRow {
  confirmed_count?: number;
  my_request_status?: JoinRequestStatus | null;
  is_member?: boolean;
  is_admin?: boolean;
  pending_requests_count?: number;
}

interface UserProfile {
  display_name: string;
  avatar_url: string | null;
}

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
  const { user, loading, signOut } = useAuth();
  const [myPeladas, setMyPeladas] = useState<PeladaCard[]>([]);
  const [availablePeladas, setAvailablePeladas] = useState<PeladaCard[]>([]);
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [openAt, setOpenAt] = useState(getDefaultOpenAt(format(new Date(), "yyyy-MM-dd")));
  const [numTeams, setNumTeams] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(10);
  const [maxGk, setMaxGk] = useState(3);
  const [title, setTitle] = useState("PELADA DO FURTO");
  const [location, setLocation] = useState("IFMA");
  const [time, setTime] = useState("19 H");
  const [fetching, setFetching] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

    const [{ data: myRequests }, { data: myMemberships }, { data: myAdminRows }, { data: profileData }, { data: superAdminRow }] = await Promise.all([
      supabase.from("pelada_join_requests").select("pelada_id, status").eq("user_id", user.id),
      supabase.from("pelada_members").select("pelada_id").eq("user_id", user.id),
      supabase.from("pelada_admins").select("pelada_id").eq("user_id", user.id),
      supabase.from("user_profiles").select("display_name, avatar_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    const profile = profileData as UserProfile | null;
    const suggestedName =
      (user.user_metadata?.full_name as string | undefined)?.trim() || (user.email ? user.email.split("@")[0] : "");

    setProfileName(profile?.display_name || suggestedName);
    setAvatarUrl(profile?.avatar_url || "");
    setProfileLoaded(true);
    setIsSuperAdmin(!!superAdminRow);

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
      setLocation(last.location);
      setTime(last.time);
    }

    const availableBase = (allData || []).filter((pelada) => pelada.user_id !== user.id);
    const availableEnriched = await enrichWithCounts(availableBase);

    const decoratedAvailable = availableEnriched.map((pelada) => {
      const delegatedAdmin = delegatedAdminPeladaIds.has(pelada.id);
      const isAdmin = delegatedAdmin || pelada.user_id === user.id;
      const requestStatus = requestStatusByPelada.get(pelada.id) || null;
      const isMember = memberPeladaIds.has(pelada.id) || requestStatus === "approved";

      return {
        ...pelada,
        my_request_status: requestStatus,
        is_member: isMember,
        is_admin: isAdmin,
        pending_requests_count: pendingByPelada.get(pelada.id) || 0,
      };
    });

    setMyPeladas(myEnriched);
    setAvailablePeladas(decoratedAvailable);
    setFetching(false);
  }, [user, enrichWithCounts]);

  useEffect(() => {
    if (user) fetchPeladas();
  }, [user, fetchPeladas]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleCreate = async () => {
    if (!isSuperAdmin) {
      toast.error("Somente admin supremo pode criar peladas");
      return;
    }

    if (profileRequired) {
      toast.error("Complete e salve seu nome no perfil antes de criar pelada");
      return;
    }

    const totalPlayers = numTeams * playersPerTeam;
    const { error } = await supabase.from("peladas").insert({
      user_id: user.id,
      date: newDate,
      title,
      location,
      time,
      num_teams: numTeams,
      players_per_team: playersPerTeam,
      max_players: totalPlayers,
      max_goalkeepers: maxGk,
      confirmations_open_at: new Date(openAt).toISOString(),
    });

    if (error) {
      toast.error("Erro ao criar pelada");
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
        toast.error("Voce ja tem uma solicitacao para essa pelada");
      } else {
        toast.error("Nao foi possivel enviar sua solicitacao");
      }
      return;
    }

    toast.success("Solicitacao enviada ao admin");
    fetchPeladas();
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${id}`);
    toast.success("Link copiado!");
  };

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      return format(new Date(y, m - 1, d), "dd 'de' MMMM", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatOpenAt = (openDateTime: string) => {
    try {
      return format(new Date(openDateTime), "dd/MM HH:mm", { locale: ptBR });
    } catch {
      return openDateTime;
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
      toast.error("Nao foi possivel salvar seu perfil");
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
        toast.error("Bucket 'avatars' nao encontrado. Crie no Storage ou rode a migration nova.");
      } else {
        toast.error("Nao foi possivel enviar a foto");
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

  const renderPeladaCard = (p: PeladaCard, options?: { showAdminActions?: boolean; availableCard?: boolean }) => {
    const showAdminActions = options?.showAdminActions ?? false;
    const availableCard = options?.availableCard ?? false;

    return (
      <div key={p.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg text-foreground">{p.title}</h3>
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
                {p.confirmed_count || 0}/{p.max_players + p.max_goalkeepers} confirmados
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
                  aguardando aprovacao
                </span>
              )}
              {availableCard && p.my_request_status === "rejected" && (
                <span className="inline-block rounded-full bg-destructive/20 px-3 py-0.5 text-xs font-medium text-destructive">
                  solicitacao recusada
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
                  {p.pending_requests_count} solicitacao(oes) pendente(s)
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
                <Link to={`/admin/${p.id}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Gerenciar"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </Button>
                </Link>
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
          <div className="mt-3 flex gap-2">
            {p.is_admin ? (
              <Link to={`/admin/${p.id}`} className="flex-1">
                <Button className="w-full gap-2">
                  <Shield className="h-4 w-4" />
                  Gerenciar
                </Button>
              </Link>
            ) : p.is_member ? (
              <Link to={`/pelada/${p.id}`} className="flex-1">
                <Button className="w-full">Abrir pelada</Button>
              </Link>
            ) : p.my_request_status === "pending" ? (
              <Button className="w-full" disabled>
                Solicitacao enviada
              </Button>
            ) : p.my_request_status === "rejected" ? (
              <Button className="w-full" disabled>
                Aguardando novo convite do admin
              </Button>
            ) : (
              <Button className="w-full gap-2" onClick={() => handleRequestJoin(p.id)} disabled={profileRequired}>
                <UserPlus className="h-4 w-4" />
                Solicitar entrada
              </Button>
            )}
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
          <Button variant="ghost" onClick={signOut} className="gap-2 text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6">
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

                  {profileRequired && (
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

              <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={profileRequired || !isSuperAdmin}>
                    <Plus className="h-4 w-4" />
                    Nova pelada
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Nova pelada</DialogTitle>
                    <DialogDescription>Defina data, abertura e configuracoes da pelada.</DialogDescription>
                  </DialogHeader>

                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg text-foreground">Configuracao</h3>
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
                          <label className="mb-1 block text-xs text-muted-foreground">Titulo</label>
                          <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="border-border bg-secondary"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Local</label>
                          <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="border-border bg-secondary"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Horario</label>
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
                      <label className="mb-1 block text-sm text-muted-foreground">Abertura das confirmacoes</label>
                      <Input
                        type="datetime-local"
                        value={openAt}
                        onChange={(e) => setOpenAt(e.target.value)}
                        className="border-border bg-secondary"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleCreate} className="gap-2" disabled={profileRequired || !isSuperAdmin}>
                      <Plus className="h-4 w-4" /> Criar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {profileRequired && (
            <p className="mt-3 text-xs text-destructive">Salve seu nome no perfil para criar pelada e solicitar entrada.</p>
          )}

          {!isSuperAdmin && (
            <p className="mt-3 text-xs text-muted-foreground">Somente admin supremo pode criar novas peladas.</p>
          )}
        </div>

        {myPeladas.length > 0 && (
          <>
            <div className="mb-3">
              <h2 className="font-display text-xl text-foreground">MINHAS PELADAS (ADMIN)</h2>
            </div>
            <div className="space-y-3">
              {myPeladas.map((pelada) => renderPeladaCard(pelada, { showAdminActions: true }))}
            </div>
          </>
        )}

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

          {availablePeladas.map((pelada) => renderPeladaCard(pelada, { availableCard: true }))}
        </div>
      </main>
    </div>
  );
};

export default Index;
