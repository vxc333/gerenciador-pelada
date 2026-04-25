import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SaaSCard } from "@/components/ui/saas-card";

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
  return <div className={cn("w-full max-w-sm rounded-lg border border-border/80 bg-card p-6 shadow-[0_1px_0_hsl(var(--border))]", className)}>{children}</div>;
};

export const PageContent = ({ children, className }: PageContentProps) => {
  return <main className={cn("container mx-auto px-4 py-6 sm:px-6 sm:py-8", className)}>{children}</main>;
};

export const PageSectionCard = ({ title, description, children, className }: PageSectionCardProps) => {
  return (
    <SaaSCard title={title} description={description} className={className}>
      {children}
    </SaaSCard>
  );
};
