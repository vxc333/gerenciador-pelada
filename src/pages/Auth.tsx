import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

const AUTH_REDIRECT_BASE_URL =
  import.meta.env.VITE_AUTH_REDIRECT_URL?.replace(/\/$/, "") ?? window.location.origin;

const Auth = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const search = new URLSearchParams(location.search);
  const redirectTo = search.get("next") || "/";

  if (loading) return null;
  if (user) return <Navigate to={redirectTo} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
      else toast.success("Login realizado!");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: AUTH_REDIRECT_BASE_URL },
      });
      if (error) toast.error(error.message);
      else toast.success("Conta criada! Verifique seu e-mail para confirmar.");
    }
    setSubmitting(false);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${AUTH_REDIRECT_BASE_URL}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl tracking-wider text-primary">PELADA DO FURTO</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin ? "Entre para gerenciar suas peladas" : "Crie sua conta de admin"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <Button type="button" variant="secondary" onClick={handleGoogleLogin} className="w-full">
            Entrar com Google
          </Button>

          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">ou use e-mail e senha</span>
            <div className="absolute left-0 top-1/2 -z-10 h-px w-full bg-border" />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted-foreground">E-mail</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-secondary border-border"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm text-muted-foreground"
            onClick={() => setIsLogin((prev) => !prev)}
          >
            {isLogin ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
