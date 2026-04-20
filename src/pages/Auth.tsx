import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { CenteredCard, CenteredPage } from "@/components/layout/PageLayout";
import { Shield } from "lucide-react";

const AUTH_REDIRECT_BASE_URL = import.meta.env.VITE_AUTH_REDIRECT_URL?.replace(/\/$/, "") ?? window.location.origin;

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
        <CenteredPage className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-sm animate-fade-in">
                <div className="mb-6 text-center">
                    <h1 className="font-display text-4xl tracking-wider text-primary">PELADA DO FURTO</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {isLogin ? "Entre para gerenciar suas peladas" : "Crie sua conta para administrar peladas"}
                    </p>
                </div>

                <CenteredCard className="border-primary/20 bg-card/95 p-6 sm:p-7">
                    <div key={isLogin ? "login" : "signup"} className="animate-fade-in">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleGoogleLogin}
                                className="h-11 w-full border-border/70 bg-secondary/40 text-foreground hover:bg-secondary"
                            >
                                Entrar com Google
                            </Button>

                            <div className="relative text-center text-xs text-muted-foreground">
                                <span className="bg-card px-2">ou continue com e-mail</span>
                                <div className="absolute left-0 top-1/2 -z-10 h-px w-full bg-border/70" />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm text-muted-foreground">E-mail</label>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-11 border-border bg-secondary focus:border-primary focus:ring-1 focus:ring-primary/30"
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
                                    className="h-11 border-border bg-secondary focus:border-primary focus:ring-1 focus:ring-primary/30"
                                />
                            </div>
                            <Button
                                type="submit"
                                className="h-11 w-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
                                disabled={submitting}
                            >
                                {submitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                className="h-11 w-full text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                                onClick={() => setIsLogin((prev) => !prev)}
                            >
                                {isLogin ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
                            </Button>
                        </form>
                    </div>
                </CenteredCard>
            </div>
        </CenteredPage>
    );
};

export default Auth;
