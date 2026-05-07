import { cn } from "@/lib/utils";
import { CenteredPage } from "@/components/layout/PageLayout";

interface PageLoadingStateProps {
  label?: string;
  className?: string;
}

export const PageLoadingState = ({ label = "Carregando", className }: PageLoadingStateProps) => {
  return (
    <CenteredPage className={cn("", className)}>
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-border/40" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <div
            className="absolute inset-[5px] rounded-full border border-primary/20 animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "1.8s" }}
          />
        </div>
        <p className="font-display text-lg tracking-[0.25em] text-muted-foreground/70">
          {label.toUpperCase()}
        </p>
      </div>
    </CenteredPage>
  );
};
