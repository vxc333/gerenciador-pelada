import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

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
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="font-display text-2xl tracking-wider text-primary">PELADA DO FURTO</h1>
          <p className="mt-3 text-sm text-muted-foreground">Conectando sua conta Google...</p>
          <p className="mt-1 text-xs text-muted-foreground">Quase lá. Você será redirecionado automaticamente.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="font-display text-2xl tracking-wider text-primary">PELADA DO FURTO</h1>
          <p className="mt-3 text-sm text-muted-foreground">Não foi possível concluir o login com Google.</p>
          <p className="mt-1 text-xs text-muted-foreground">Tente novamente em instantes.</p>
          <div className="mt-4">
            <Link to="/auth">
              <Button className="w-full">Voltar para login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;