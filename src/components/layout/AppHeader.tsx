import { memo, type ReactNode } from "react";
import { SaaSNavbar } from "@/components/layout/SaaSNavbar";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onSignOut?: () => void;
  actions?: ReactNode;
}

export const AppHeader = memo(function AppHeader({
  title,
  subtitle,
  backTo,
  onSignOut,
  actions,
}: AppHeaderProps) {
  return <SaaSNavbar title={title} subtitle={subtitle} backTo={backTo} onSignOut={onSignOut} actions={actions} />;
});
