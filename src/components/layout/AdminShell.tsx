import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Menu } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { SaaSSidebar } from "@/components/layout/SaaSSidebar";
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        title={title}
        subtitle={subtitle}
        backTo={backTo}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex lg:items-center lg:gap-2">{actions}</div>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="border-border/80 bg-card hover:bg-secondary lg:hidden" aria-label="Abrir menu administrativo">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 border-r border-border/80 bg-sidebar">
                <SheetHeader>
                  <SheetTitle>Menu administrativo</SheetTitle>
                  <SheetDescription>Navegue entre os módulos de administração</SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <SaaSSidebar items={navItems} title="Administração" className="border-0 bg-transparent p-0" />
                </div>
                {actions ? <div className="mt-6 border-t border-border/60 pt-4">{actions}</div> : null}
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <main className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <SaaSSidebar items={navItems} title="Administração" />
            </div>
          </aside>

          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </div>
  );
}
