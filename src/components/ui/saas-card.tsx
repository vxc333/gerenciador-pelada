import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SaaSCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SaaSCard({
  title,
  description,
  actions,
  children,
  className,
}: SaaSCardProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border/80 bg-card px-5 py-4 shadow-[0_1px_0_hsl(var(--border))] sm:px-6 sm:py-5",
        className,
      )}
    >
      {title || description || actions ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
          <div className="space-y-1">
            {title ? <h2 className="text-base font-semibold text-foreground sm:text-lg">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      {children}
    </section>
  );
}
