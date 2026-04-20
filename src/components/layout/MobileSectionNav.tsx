import { type LucideIcon } from "lucide-react";

interface MobileSectionItem<T extends string> {
  key: T;
  label: string;
  icon: LucideIcon;
}

interface MobileSectionNavProps<T extends string> {
  items: MobileSectionItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
}

export function MobileSectionNav<T extends string>({ items, activeKey, onChange }: MobileSectionNavProps<T>) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-3xl items-stretch gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;

          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={[
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-all duration-200 ease-out",
                "flex-1 basis-0",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.97]",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
