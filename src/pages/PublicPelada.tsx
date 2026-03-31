import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UserPlus, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
}

interface PlayerRow {
  id: string;
  name: string;
  position: number;
  is_waiting: boolean;
  is_goalkeeper: boolean;
}

const PublicPelada = () => {
  const { id } = useParams<{ id: string }>();
  const [pelada, setPelada] = useState<PeladaRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [name, setName] = useState("");
  const [isGoalkeeper, setIsGoalkeeper] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`pelada-${id}`)
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

  if (notFound) return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-muted-foreground">Pelada nao encontrada</p>
      </div>
    </div>
  );
  if (!pelada) return null;

  const mainPlayers = players.filter(p => !p.is_waiting && !p.is_goalkeeper);
  const waitingPlayers = players.filter(p => p.is_waiting && !p.is_goalkeeper);
  const goalkeepers = players.filter(p => p.is_goalkeeper && !p.is_waiting);
  const waitingGks = players.filter(p => p.is_goalkeeper && p.is_waiting);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Digite seu nome!"); return; }

    // Guest detection: check if same name registered in last 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const { data: recentPeladas } = await supabase
      .from("peladas")
      .select("id")
      .gte("date", threeDaysAgo.toISOString().split("T")[0]);

    let displayName = trimmed;
    if (recentPeladas && recentPeladas.length > 0) {
      const recentIds = recentPeladas.map(r => r.id);
      const { data: recentPlayers } = await supabase
        .from("pelada_players")
        .select("name")
        .in("pelada_id", recentIds);
      
      if (recentPlayers) {
        // Check if this exact name (base, without parentheses) already exists
        const baseNames = recentPlayers.map(p => p.name.split("(")[0].trim().toLowerCase());
        const inputBase = trimmed.split(" ")[0].toLowerCase();
        const count = baseNames.filter(n => n === inputBase).length;
        if (count > 0) {
          // Check if this person already registered in THIS pelada
          const alreadyInThis = players.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
          if (alreadyInThis) {
            toast.error("Voce ja esta na lista!");
            return;
          }
          // If same first name exists, format as FirstName(LastName)
          const parts = trimmed.split(" ");
          if (parts.length > 1) {
            displayName = `${parts[0]}(${parts.slice(1).join(" ")})`;
          }
        }
      }
    }

    const pos = players.length > 0 ? Math.max(...players.map(p => p.position)) + 1 : 1;

    if (isGoalkeeper) {
      const isWaiting = goalkeepers.length >= pelada.max_goalkeepers;
      const { error } = await supabase.from("pelada_players").insert({
        pelada_id: pelada.id,
        name: displayName,
        position: pos,
        is_goalkeeper: true,
        is_waiting: isWaiting,
      });
      if (error) { toast.error("Erro ao confirmar"); return; }
      toast.success(isWaiting ? "Adicionado na lista de espera!" : "Goleiro confirmado!");
    } else {
      const isWaiting = mainPlayers.length >= pelada.max_players;
      const { error } = await supabase.from("pelada_players").insert({
        pelada_id: pelada.id,
        name: displayName,
        position: pos,
        is_goalkeeper: false,
        is_waiting: isWaiting,
      });
      if (error) { toast.error("Erro ao confirmar"); return; }
      toast.success(isWaiting ? "Adicionado na lista de espera!" : "Presenca confirmada!");
    }
    setName("");
  };

  const sortedMain = [...mainPlayers].sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card py-6 px-4 text-center">
        <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-primary">{pelada.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{pelada.location} - {pelada.time}</p>
        <p className="mt-1 text-xs text-muted-foreground">{pelada.date}</p>
        <p className="mt-1 text-xs text-muted-foreground">{pelada.num_teams} times x {pelada.players_per_team} jogadores</p>
      </div>

      <main className="container mx-auto max-w-md px-4 py-5 space-y-5">
        <div className="rounded-lg border border-primary/30 bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">CONFIRME SUA PRESENCA</h2>
          <div className="mb-3">
            <Input
              placeholder="Seu nome e sobrenome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="bg-secondary border-border"
            />
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Checkbox
              id="goalkeeper"
              checked={isGoalkeeper}
              onCheckedChange={(checked) => setIsGoalkeeper(!!checked)}
            />
            <label htmlFor="goalkeeper" className="flex items-center gap-1 text-sm text-muted-foreground cursor-pointer">
              <Shield className="h-3.5 w-3.5" /> Sou goleiro
            </label>
          </div>
          <Button onClick={handleSubmit} className="w-full">
            Confirmar Presenca
          </Button>
        </div>

        {/* Main list */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">JOGADORES ({mainPlayers.length}/{pelada.max_players})</h2>
          <div className="space-y-1">
            {Array.from({ length: pelada.max_players }, (_, i) => {
              const player = sortedMain[i];
              return (
                <div key={i} className={`rounded-md px-3 py-2 text-sm ${player ? "bg-secondary text-foreground" : "bg-muted/30 text-muted-foreground"}`}>
                  {i + 1}- {player?.name || ""}
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
                <div key={p.id} className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
                  {i + 1}. {p.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goalkeepers */}
        {(goalkeepers.length > 0 || waitingGks.length > 0) && (
          <div className="rounded-lg border border-accent/30 bg-card p-4">
            <h2 className="mb-3 font-display text-lg text-accent">GOLEIROS ({goalkeepers.length}/{pelada.max_goalkeepers})</h2>
            <div className="space-y-1">
              {goalkeepers.map((gk) => (
                <div key={gk.id} className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground">- {gk.name}</div>
              ))}
            </div>
            {waitingGks.length > 0 && (
              <>
                <h3 className="mt-3 mb-2 text-sm font-medium text-muted-foreground">Espera</h3>
                <div className="space-y-1">
                  {waitingGks.map((gk) => (
                    <div key={gk.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">- {gk.name}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicPelada;
