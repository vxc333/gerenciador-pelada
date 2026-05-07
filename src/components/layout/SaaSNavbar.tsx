import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaaSButton } from "@/components/ui/saas-button";

interface SaaSNavbarProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
  onSignOut?: () => void;
  className?: string;
}

export function SaaSNavbar({
  title,
  subtitle,
  backTo,
  actions,
  onSignOut,
  className,
}: SaaSNavbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/60 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/88",
        className,
      )}
    >
      <div className="container mx-auto flex min-h-[64px] items-center gap-3 px-4 sm:px-6">
        {backTo ? (
          <Link to={backTo}>
            <SaaSButton variant="ghost" size="icon" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </SaaSButton>
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl tracking-widest text-foreground sm:text-3xl">{title}</h1>
          {subtitle ? <p className="-mt-1 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2">{actions}</div>

        {onSignOut ? (
          <SaaSButton variant="ghost" onClick={onSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </SaaSButton>
        ) : null}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />
    </header>
  );
}
