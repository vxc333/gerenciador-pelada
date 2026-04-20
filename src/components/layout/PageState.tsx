import { type ReactNode } from "react";
import { CenteredCard, CenteredPage } from "@/components/layout/PageLayout";
import { cn } from "@/lib/utils";

interface PageStateProps {
  title?: string;
  message: string;
  details?: string;
  action?: ReactNode;
  className?: string;
}

export const PageState = ({ title, message, details, action, className }: PageStateProps) => {
  if (!title && !details && !action) {
    return (
      <CenteredPage>
        <p className={cn("text-muted-foreground", className)}>{message}</p>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
      <CenteredCard className={cn("text-center", className)}>
        {title ? <h1 className="font-display text-2xl tracking-wider text-primary">{title}</h1> : null}
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        {details ? <p className="mt-1 text-xs text-muted-foreground">{details}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </CenteredCard>
    </CenteredPage>
  );
};
