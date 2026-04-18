import { memo } from "react";
import { Bell, CheckCircle2, ShieldAlert, Shuffle, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTimeBrasilia } from "@/lib/datetime-br";

export type NotificationEvent = {
  id: string;
  type: "request" | "approval" | "ban" | "draw";
  peladaId: string;
  peladaTitle: string;
  message: string;
  at: string;
  isPending?: boolean;
};

const typeConfig: Record<
  NotificationEvent["type"],
  { icon: typeof Bell; colorClass: string; bgClass: string }
> = {
  request: {
    icon: UserCheck,
    colorClass: "text-accent",
    bgClass: "bg-accent/10",
  },
  approval: {
    icon: CheckCircle2,
    colorClass: "text-primary",
    bgClass: "bg-primary/10",
  },
  ban: {
    icon: ShieldAlert,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/10",
  },
  draw: {
    icon: Shuffle,
    colorClass: "text-primary",
    bgClass: "bg-primary/10",
  },
};

const formatTime = (at: string) => {
  try {
    return formatDateTimeBrasilia(at);
  } catch {
    return at;
  }
};

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: NotificationEvent[];
  pendingCount: number;
}

export const NotificationsSheet = memo(function NotificationsSheet({
  open,
  onOpenChange,
  events,
  pendingCount,
}: NotificationsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {pendingCount > 0 && (
            <Badge className="absolute -right-1.5 -top-1.5 h-5 min-w-5 px-1 text-[10px] animate-fade-in">
              {pendingCount > 99 ? "99+" : pendingCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl tracking-wide">NOTIFICAÇÕES</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Sem eventos recentes</p>
            </div>
          ) : (
            events.map((event) => {
              const cfg = typeConfig[event.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={event.id}
                  className="flex gap-3 rounded-xl border border-border bg-card p-3 animate-slide-up"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bgClass}`}>
                    <Icon className={`h-4 w-4 ${cfg.colorClass}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {event.peladaTitle}
                    </p>
                    <p className="text-sm text-foreground">{event.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatTime(event.at)}</p>
                  </div>
                  {event.isPending && (
                    <span className="mt-0.5 shrink-0 self-start rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                      novo
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});
