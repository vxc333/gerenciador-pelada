import { useState, useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Copy, Link as LinkIcon, Trash2, Plus, Shield } from "lucide-react";
import { toast } from "sonner";

interface PlayerRow {
  id: string;
  name: string;
  position: number;
  is_waiting: boolean;
  is_goalkeeper: boolean;
}

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
  user_id: string;
}

const AdminPelada = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [pelada, setPelada] = useState<PeladaRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [newPlayer, setNewPlayer] = useState("");
  const [newIsGk, setNewIsGk] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id && user) fetchAll();
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`admin-pelada-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pelada_players", filter: `pelada_id=eq.${id}` }, () => fetchPlayers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchAll = async () => {
    const { data: p } = await supabase.from("peladas").select("*").eq("id", id!).single();
    if (!p) { setNotFound(true); return; }
    setPelada(p);
    fetchPlayers();
  };

  const fetchPlayers = async () => {
    const { data } = await supabase.from("pelada_players").select("*").eq("pelada_id", id!).order("position");
    setPlayers(data || []);
  };

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (notFound) return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-muted-foreground">Pelada nao encontrada</p>
    </div>
  );
  if (!pelada) return null;

  const mainPlayers = players.filter(p => !p.is_waiting && !p.is_goalkeeper);
  const waitingPlayers = players.filter(p => p.is_waiting && !p.is_goalkeeper);
  const goalkeepers = players.filter(p => p.is_goalkeeper && !p.is_waiting);
  const waitingGks = players.filter(p => p.is_goalkeeper && p.is_waiting);

  const getNextPosition = () => {
    if (players.length === 0) return 1;
    return Math.max(...players.map(p => p.position)) + 1;
  };

  const handleAddPlayer = async () => {
    if (!newPlayer.trim()) return;

    const pos = getNextPosition();

    if (newIsGk) {
      const isWaiting = goalkeepers.length >= pelada.max_goalkeepers;
      const { error } = await supabase.from("pelada_players").insert({
        pelada_id: pelada.id,
        name: newPlayer.trim(),
        position: pos,
        is_goalkeeper: true,
        is_waiting: isWaiting,
      });
      if (error) { toast.error("Erro ao adicionar"); return; }
    } else {
      const isWaiting = mainPlayers.length >= pelada.max_players;
      const { error } = await supabase.from("pelada_players").insert({
        pelada_id: pelada.id,
        name: newPlayer.trim(),
        position: pos,
        is_goalkeeper: false,
        is_waiting: isWaiting,
      });
      if (error) { toast.error("Erro ao adicionar"); return; }
    }
    setNewPlayer("");
    setNewIsGk(false);
    fetchPlayers();
  };

  const handleRemovePlayer = async (playerId: string) => {
    await supabase.from("pelada_players").delete().eq("id", playerId);
    fetchPlayers();
  };

  const handleExport = () => {
    const dateFormatted = pelada.date.split("-").reverse().slice(0, 2).join("/");
    let text = `LISTA ${pelada.title} - ${dateFormatted}\n\n`;
    text += `${pelada.location} - ${pelada.time}\n\n`;
    text += `*Nome e sobrenome*\n\n`;

    // Main players - numbered list, sorted by order added
    const sorted = [...mainPlayers].sort((a, b) => a.position - b.position);
    for (let i = 0; i < pelada.max_players; i++) {
      const player = sorted[i];
      text += `${i + 1}- ${player ? player.name : ""}\n`;
    }

    if (waitingPlayers.length > 0) {
      text += `\nLISTA DE ESPERA:\n\n`;
      waitingPlayers.forEach((p) => {
        text += `- ${p.name}\n`;
      });
    }

    if (goalkeepers.length > 0 || waitingGks.length > 0) {
      text += `\nGOLEIROS:\n\n`;
      for (const gk of goalkeepers) text += `- ${gk.name}\n`;
      const emptyGk = pelada.max_goalkeepers - goalkeepers.length;
      for (let i = 0; i < emptyGk; i++) text += `-\n`;
    }

    if (waitingGks.length > 0) {
      text += `\nGOLEIROS ESPERA:\n\n`;
      for (const gk of waitingGks) text += `- ${gk.name}\n`;
    }

    navigator.clipboard.writeText(text);
    toast.success("Lista copiada!");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pelada/${pelada.id}`);
    toast.success("Link copiado!");
  };

  const sortedMain = [...mainPlayers].sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl text-primary truncate">{pelada.title}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {pelada.location} - {pelada.time} - {pelada.date} - {pelada.num_teams} times x {pelada.players_per_team}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-5 space-y-5">
        <div className="flex gap-2">
          <Button onClick={handleExport} className="flex-1 gap-2 text-sm">
            <Copy className="h-4 w-4" />Exportar p/ WhatsApp
          </Button>
          <Button variant="secondary" onClick={copyLink} className="gap-2 text-sm">
            <LinkIcon className="h-4 w-4" /><span className="hidden sm:inline">Copiar</span> Link
          </Button>
        </div>

        {/* Add player */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">ADICIONAR</h2>
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="Nome do jogador"
              value={newPlayer}
              onChange={(e) => setNewPlayer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
              className="bg-secondary border-border"
            />
            <Button onClick={handleAddPlayer} size="icon" className="flex-shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="admin-gk"
              checked={newIsGk}
              onCheckedChange={(checked) => setNewIsGk(!!checked)}
            />
            <label htmlFor="admin-gk" className="flex items-center gap-1 text-sm text-muted-foreground cursor-pointer">
              <Shield className="h-3.5 w-3.5" /> Goleiro
            </label>
          </div>
        </div>

        {/* Players */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">JOGADORES ({mainPlayers.length}/{pelada.max_players})</h2>
          <div className="space-y-1">
            {Array.from({ length: pelada.max_players }, (_, i) => {
              const player = sortedMain[i];
              return (
                <div key={i} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${player ? "bg-secondary" : "bg-muted/30"}`}>
                  <span className={`truncate ${player ? "text-foreground" : "text-muted-foreground"}`}>
                    {i + 1}- {player?.name || ""}
                  </span>
                  {player && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePlayer(player.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Waiting list */}
        {waitingPlayers.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-card p-4">
            <h2 className="mb-3 font-display text-lg text-destructive">LISTA DE ESPERA ({waitingPlayers.length})</h2>
            <div className="space-y-1">
              {waitingPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm">
                  <span className="text-foreground truncate">{i + 1}. {p.name}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePlayer(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goalkeepers */}
        <div className="rounded-lg border border-accent/30 bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-accent">GOLEIROS ({goalkeepers.length}/{pelada.max_goalkeepers})</h2>
          <div className="space-y-1">
            {goalkeepers.map((gk) => (
              <div key={gk.id} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm">
                <span className="text-foreground truncate">- {gk.name}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePlayer(gk.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {goalkeepers.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Nenhum goleiro ainda</p>}
          </div>
          {waitingGks.length > 0 && (
            <>
              <h3 className="mt-3 mb-2 text-sm font-medium text-muted-foreground">Espera</h3>
              <div className="space-y-1">
                {waitingGks.map((gk) => (
                  <div key={gk.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground truncate">- {gk.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePlayer(gk.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminPelada;
