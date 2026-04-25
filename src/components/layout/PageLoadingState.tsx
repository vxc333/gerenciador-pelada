import { Loader2 } from "lucide-react";
import { CenteredCard, CenteredPage } from "@/components/layout/PageLayout";
import { cn } from "@/lib/utils";

interface PageLoadingStateProps {
  label?: string;
  className?: string;
}

export const PageLoadingState = ({ label = "Carregando...", className }: PageLoadingStateProps) => {
  return (
    <CenteredPage>
      <CenteredCard className={cn("text-center", className)}>
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-muted/30">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      </CenteredCard>
    </CenteredPage>
  );
};
