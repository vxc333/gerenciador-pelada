import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onSignOut?: () => void;
  actions?: ReactNode;
}

export const AppHeader = memo(function AppHeader({
  title,
  subtitle,
  backTo,
  onSignOut,
  actions,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center gap-3 px-4 py-3">
        {backTo && (
          <Link to={backTo}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl tracking-wider text-primary sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onSignOut && (
            <Button
              variant="ghost"
              onClick={onSignOut}
              className="gap-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
});
