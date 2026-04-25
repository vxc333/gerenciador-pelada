import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Menu } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface AdminShellNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface AdminShellProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  navItems: AdminShellNavItem[];
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ title, subtitle, backTo = "/", navItems, actions, children }: AdminShellProps) {
  const location = useLocation();

  const renderNavButtons = (onNavigate?: () => void) =>
    navItems.map((item) => {
      const Icon = item.icon;
      const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

      return (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={[
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
          {item.label}
        </Link>
      );
    });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={title}
        subtitle={subtitle}
        backTo={backTo}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex lg:items-center lg:gap-2">{actions}</div>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Abrir menu administrativo">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 border-r border-border/60 bg-card/95 backdrop-blur-sm">
                <SheetHeader>
                  <SheetTitle>Menu administrativo</SheetTitle>
                  <SheetDescription>Navegue entre os módulos de administração</SheetDescription>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-1">{renderNavButtons()}</div>
                {actions ? <div className="mt-6 border-t border-border/60 pt-4">{actions}</div> : null}
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <main className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-border/60 bg-card/50 p-2 backdrop-blur-sm">
              <p className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Administração
              </p>
              <div className="space-y-0.5">{renderNavButtons()}</div>
            </div>
          </aside>

          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </div>
  );
}
