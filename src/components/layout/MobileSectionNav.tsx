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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/97 backdrop-blur lg:hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="mx-auto flex max-w-3xl items-stretch gap-0.5 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;

          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={[
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold tracking-wide transition-all duration-150 ease-out",
                "flex-1 basis-0",
                isActive
                  ? "border border-primary/25 bg-primary/12 text-primary"
                  : "border border-transparent text-muted-foreground/80 hover:border-border/60 hover:bg-secondary hover:text-foreground active:scale-[0.97]",
              ].join(" ")}
            >
              <Icon className={`h-[18px] w-[18px] transition-transform duration-150 ${isActive ? "scale-110" : ""}`} />
              <span className="truncate font-body">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
