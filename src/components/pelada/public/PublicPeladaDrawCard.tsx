import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DrawTeam } from "@/components/pelada/public/types";

type PublicPeladaDrawCardProps = {
  isAdmin: boolean;
  drawResult: DrawTeam[] | null;
  onExportDraw: () => void;
};

export const PublicPeladaDrawCard = ({ isAdmin, drawResult, onExportDraw }: PublicPeladaDrawCardProps) => (
  <div className="rounded-lg border border-accent/30 bg-card p-4">
    <h2 className="mb-2 font-display text-lg text-accent">SORTEIO OFICIAL</h2>
    <p className="mb-3 text-xs text-muted-foreground">Esse sorteio foi realizado apenas uma vez.</p>

    {isAdmin && (
      <div className="mb-3">
        <Button onClick={onExportDraw} className="gap-2">
          <Download className="h-4 w-4" /> Copiar sorteio
        </Button>
      </div>
    )}

    {Array.isArray(drawResult) && drawResult.length > 0 ? (
      <div className="space-y-3">
        {drawResult.map((team) => (
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
);