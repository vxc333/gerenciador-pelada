import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CenteredCard, CenteredPage } from "@/components/layout/PageLayout";
import { Shield } from "lucide-react";

const AuthCallback = () => {
  const { user, loading, profileChecked } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const search = new URLSearchParams(location.search);
  const redirectTo = search.get("next") || "/";

  useEffect(() => {
    if (!loading && user && profileChecked) {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, navigate, profileChecked, redirectTo, user]);

  if (loading || (user && !profileChecked)) {
    return (
      <CenteredPage className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm animate-fade-in">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-3 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <Shield className="h-3.5 w-3.5" /> acesso seguro
            </span>
            <h1 className="font-display text-4xl tracking-wider text-primary">PELADA DO FURTO</h1>
          </div>

          <CenteredCard className="border-primary/20 bg-card/95 p-6 text-center sm:p-7">
            <p className="text-sm text-muted-foreground">Conectando sua conta Google...</p>
            <p className="mt-1 text-xs text-muted-foreground">Quase lá. Você será redirecionado automaticamente.</p>
          </CenteredCard>
        </div>
      </CenteredPage>
    );
  }

  if (!user) {
    return (
      <CenteredPage className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm animate-fade-in">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-3 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <Shield className="h-3.5 w-3.5" /> acesso seguro
            </span>
            <h1 className="font-display text-4xl tracking-wider text-primary">PELADA DO FURTO</h1>
          </div>

          <CenteredCard className="border-primary/20 bg-card/95 p-6 text-center sm:p-7">
            <p className="text-sm text-muted-foreground">Não foi possível concluir o login com Google.</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente novamente em instantes.</p>
            <div className="mt-4">
              <Link to="/auth">
                <Button className="h-11 w-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]">
                  Voltar para login
                </Button>
              </Link>
            </div>
          </CenteredCard>
        </div>
      </CenteredPage>
    );
  }

  return null;
};

export default AuthCallback;