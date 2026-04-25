import type { LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface SaaSSidebarProps {
  items: SidebarItem[];
  title?: string;
  onNavigate?: () => void;
  className?: string;
}

export function SaaSSidebar({
  items,
  title = "Navegação",
  onNavigate,
  className,
}: SaaSSidebarProps) {
  const location = useLocation();
  const activePath = useMemo(() => {
    const pathname = location.pathname !== "/" && location.pathname.endsWith("/")
      ? location.pathname.slice(0, -1)
      : location.pathname;

    const matches = items
      .map((item) => item.to)
      .filter((to) => pathname === to || pathname.startsWith(`${to}/`))
      .sort((a, b) => b.length - a.length);

    return matches[0] || "";
  }, [items, location.pathname]);

  return (
    <aside className={cn("rounded-lg border border-border/80 bg-sidebar p-2", className)}>
      <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePath === item.to;

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-sidebar-foreground/80 hover:border-border/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
