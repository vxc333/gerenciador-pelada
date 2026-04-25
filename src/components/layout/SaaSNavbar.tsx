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
        "sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      <div className="container mx-auto flex min-h-[68px] items-center gap-3 px-4 sm:px-6">
        {backTo ? (
          <Link to={backTo}>
            <SaaSButton variant="ghost" size="icon" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </SaaSButton>
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2">{actions}</div>

        {onSignOut ? (
          <SaaSButton variant="ghost" onClick={onSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </SaaSButton>
        ) : null}
      </div>
    </header>
  );
}
