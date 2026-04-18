import { memo } from "react";
import {
  Settings,
  List,
  Clock,
  Users,
  Heart,
} from "lucide-react";

export type AdminMenu = "config" | "lista" | "historico" | "queridometro" | "membros";

const TABS: Array<{ key: AdminMenu; label: string; icon: typeof Settings }> = [
  { key: "config", label: "Configurar", icon: Settings },
  { key: "lista", label: "Lista", icon: List },
  { key: "historico", label: "Histórico", icon: Clock },
  { key: "membros", label: "Membros", icon: Users },
  { key: "queridometro", label: "Queridômetro", icon: Heart },
];

interface AdminTabsProps {
  active: AdminMenu;
  onChange: (menu: AdminMenu) => void;
  pendingCount?: number;
}

export const AdminTabs = memo(function AdminTabs({ active, onChange, pendingCount = 0 }: AdminTabsProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-1.5 backdrop-blur-sm">
      <div className="flex flex-wrap gap-1">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          const showBadge = key === "lista" && pendingCount > 0;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={[
                "relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {showBadge && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
