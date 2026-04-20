import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CenteredPageProps {
  children: ReactNode;
  className?: string;
}

interface CenteredCardProps {
  children: ReactNode;
  className?: string;
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

interface PageSectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const CenteredPage = ({ children, className }: CenteredPageProps) => {
  return <div className={cn("flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:px-6", className)}>{children}</div>;
};

export const CenteredCard = ({ children, className }: CenteredCardProps) => {
  return <div className={cn("w-full max-w-sm rounded-xl border border-border/50 bg-card/95 p-6 backdrop-blur-sm", className)}>{children}</div>;
};

export const PageContent = ({ children, className }: PageContentProps) => {
  return <main className={cn("container mx-auto px-4 py-6 sm:px-6 sm:py-8", className)}>{children}</main>;
};

export const PageSectionCard = ({ title, description, children, className }: PageSectionCardProps) => {
  return (
    <section className={cn("rounded-xl border border-border/50 bg-card p-5 transition-colors hover:border-border", className)}>
      <h2 className="mb-1 font-display text-2xl tracking-wide text-foreground">{title}</h2>
      {description ? <p className="mb-4 text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
};
