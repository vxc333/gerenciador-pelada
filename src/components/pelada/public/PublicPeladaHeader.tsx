import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PublicPeladaHeaderProps = {
  peladaId: string;
  title: string;
  location: string;
  time: string;
  gameDateLabel: string;
  canManagePelada: boolean;
  pendingRequestsCount: number;
};

export const PublicPeladaHeader = ({
  peladaId,
  title,
  location,
  time,
  gameDateLabel,
  canManagePelada,
  pendingRequestsCount,
}: PublicPeladaHeaderProps) => (
  <div className="border-b border-border/50 bg-background/80 px-4 py-6 backdrop-blur-md">
    <div className="container mx-auto flex max-w-md items-center justify-between gap-3">
      <Link to="/">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground transition-all hover:bg-secondary hover:text-primary active:scale-[0.97]">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </Link>
      <div className="flex-1 text-center">
        <h1 className="font-display text-2xl tracking-wider text-primary sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{location} • Horário: {time}</p>
        <p className="mt-1 text-xs text-muted-foreground">{gameDateLabel}</p>
      </div>
      {canManagePelada && (
        <Link to={`/admin/${peladaId}`}>
          <Button variant="outline" size="icon" className="relative h-9 w-9 border-border/60 text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary hover:text-primary active:scale-[0.97]">
            <Shield className="h-5 w-5" />
            {pendingRequestsCount > 0 && (
              <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-[10px]">{pendingRequestsCount}</Badge>
            )}
          </Button>
        </Link>
      )}
    </div>
  </div>
);