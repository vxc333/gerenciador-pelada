import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Plus, Trash2, Link as LinkIcon, Settings as SettingsIcon, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Navigate } from "react-router-dom";

interface PeladaRow {
  id: string;
  title: string;
  location: string;
  time: string;
  date: string;
  max_players: number;
  max_goalkeepers: number;
  num_teams: number;
  players_per_team: number;
  created_at: string;
  player_count?: number;
  gk_count?: number;
}

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const [peladas, setPeladas] = useState<PeladaRow[]>([]);
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [numTeams, setNumTeams] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(10);
  const [maxGk, setMaxGk] = useState(3);
  const [title, setTitle] = useState("PELADA DO FURTO");
  const [location, setLocation] = useState("IFMA");
  const [time, setTime] = useState("19 H");
  const [fetching, setFetching] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (user) fetchPeladas();
  }, [user]);

  // Load defaults from last pelada
  useEffect(() => {
    if (peladas.length > 0) {
      const last = peladas[0];
      setNumTeams(last.num_teams);
      setPlayersPerTeam(last.players_per_team);
      setMaxGk(last.max_goalkeepers);
      setTitle(last.title);
      setLocation(last.location);
      setTime(last.time);
    }
  }, [peladas]);

  const fetchPeladas = async () => {
    const { data, error } = await supabase
      .from("peladas")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) { toast.error("Erro ao carregar"); return; }

    const withCounts = await Promise.all(
      (data || []).map(async (p) => {
        const { count: pc } = await supabase
          .from("pelada_players")
          .select("*", { count: "exact", head: true })
          .eq("pelada_id", p.id)
          .eq("is_waiting", false)
          .eq("is_goalkeeper", false);
        const { count: gc } = await supabase
          .from("pelada_players")
          .select("*", { count: "exact", head: true })
          .eq("pelada_id", p.id)
          .eq("is_goalkeeper", true);
        return { ...p, player_count: pc || 0, gk_count: gc || 0 };
      })
    );
    setPeladas(withCounts);
    setFetching(false);
  };

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleCreate = async () => {
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
    });
    if (error) { toast.error("Erro ao criar"); return; }
    toast.success("Pelada criada!");
    fetchPeladas();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("peladas").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Pelada removida");
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
    } catch { return dateStr; }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-primary">PELADA DO FURTO</h1>
          <Button variant="ghost" onClick={signOut} className="gap-2 text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* Create */}
        <div className="mb-6 rounded-lg border border-primary/30 bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-foreground">NOVA PELADA</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="gap-1 text-muted-foreground"
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Configurar</span>
            </Button>
          </div>

          {showSettings && (
            <div className="mb-4 space-y-3 rounded-md border border-border bg-secondary/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Titulo</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Local</label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Horario</label>
                  <Input value={time} onChange={(e) => setTime(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Qtd Times</label>
                  <Input type="number" min={2} max={10} value={numTeams} onChange={(e) => setNumTeams(Number(e.target.value))} className="bg-secondary border-border" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Por time</label>
                  <Input type="number" min={3} max={20} value={playersPerTeam} onChange={(e) => setPlayersPerTeam(Number(e.target.value))} className="bg-secondary border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Max Goleiros</label>
                  <Input type="number" min={1} max={10} value={maxGk} onChange={(e) => setMaxGk(Number(e.target.value))} className="bg-secondary border-border" />
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

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-muted-foreground">Data</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} className="gap-2">
                <Plus className="h-4 w-4" /> Criar
              </Button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {!fetching && peladas.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground">Nenhuma pelada criada ainda</p>
            </div>
          )}

          {peladas.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg text-foreground truncate">{p.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(p.date)}</span>
                    <span>{p.location}</span>
                    <span>{p.time}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-block rounded-full bg-primary/20 px-3 py-0.5 text-xs font-medium text-primary">
                      {p.player_count}/{p.max_players} jogadores
                    </span>
                    <span className="inline-block rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
                      {p.num_teams} times x {p.players_per_team}
                    </span>
                    {(p.gk_count || 0) > 0 && (
                      <span className="inline-block rounded-full bg-accent/20 px-3 py-0.5 text-xs font-medium text-accent">
                        {p.gk_count} goleiro{p.gk_count! > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => copyLink(p.id)} title="Copiar link" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                  <Link to={`/admin/${p.id}`}>
                    <Button variant="ghost" size="icon" title="Gerenciar" className="h-8 w-8 text-muted-foreground hover:text-primary">
                      <SettingsIcon className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Excluir" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Index;
