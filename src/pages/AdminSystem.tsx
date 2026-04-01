import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type UserProfileRow = Tables<"user_profiles">;

interface AutomaticMember {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
}

interface AutomaticAdmin {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
}

const AdminSystem = () => {
  const { user, loading, profileChecked } = useAuth();

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [automaticMembers, setAutomaticMembers] = useState<AutomaticMember[]>([]);
  const [automaticAdmins, setAutomaticAdmins] = useState<AutomaticAdmin[]>([]);
  const [searchMemberEmail, setSearchMemberEmail] = useState("");
  const [searchAdminEmail, setSearchAdminEmail] = useState("");

  // Check if user is super admin and load data
  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: superAdminRow } = await supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle();

    if (!superAdminRow) {
      setIsSuperAdmin(false);
      return;
    }

    setIsSuperAdmin(true);

    // Load automatic members
    const { data: membersData } = await supabase
      .from("pelada_automatic_members")
      .select(`
        id,
        user_id,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (membersData) {
      const memberIds = membersData.map((m) => m.user_id);
      const { data: profiles } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", memberIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach((p) => {
        profileMap[p.user_id] = p.display_name;
      });

      const members = membersData.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        display_name: profileMap[m.user_id] || "Usuário sem nome",
        created_at: m.created_at,
      }));

      setAutomaticMembers(members);
    }

    // Load automatic admins
    const { data: adminsData } = await supabase
      .from("pelada_automatic_admins")
      .select(`
        id,
        user_id,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (adminsData) {
      const adminIds = adminsData.map((a) => a.user_id);
      const { data: profiles } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", adminIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach((p) => {
        profileMap[p.user_id] = p.display_name;
      });

      const admins = adminsData.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        display_name: profileMap[a.user_id] || "Usuário sem nome",
        created_at: a.created_at,
      }));

      setAutomaticAdmins(admins);
    }
  }, [user]);

  useEffect(() => {
    if (user && profileChecked) {
      loadData();
    }
  }, [user, profileChecked, loadData]);

  // Add user to automatic members
  const addAutomaticMember = async () => {
    if (!searchMemberEmail.trim()) {
      toast.error("Digite um email válido");
      return;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${searchMemberEmail}%`)
      .single();

    if (!profile) {
      toast.error("Usuário não encontrado");
      return;
    }

    const { error } = await supabase.from("pelada_automatic_members").insert({
      user_id: profile.user_id,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Este usuário já está na lista de acesso automático");
      } else {
        toast.error("Erro ao adicionar usuário");
      }
      return;
    }

    toast.success(`${profile.display_name} adicionado ao acesso automático`);
    setSearchMemberEmail("");
    loadData();
  };

  // Remove user from automatic members
  const removeAutomaticMember = async (id: string) => {
    const { error } = await supabase.from("pelada_automatic_members").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao remover usuário");
      return;
    }

    toast.success("Usuário removido do acesso automático");
    loadData();
  };

  // Add user to automatic admins
  const addAutomaticAdmin = async () => {
    if (!searchAdminEmail.trim()) {
      toast.error("Digite um email válido");
      return;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${searchAdminEmail}%`)
      .single();

    if (!profile) {
      toast.error("Usuário não encontrado");
      return;
    }

    const { error } = await supabase.from("pelada_automatic_admins").insert({
      user_id: profile.user_id,
      created_by: user?.id,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Este usuário já é admin automático");
      } else {
        toast.error("Erro ao adicionar admin");
      }
      return;
    }

    toast.success(`${profile.display_name} promovido a admin do sistema`);
    setSearchAdminEmail("");
    loadData();
  };

  // Remove user from automatic admins
  const removeAutomaticAdmin = async (id: string) => {
    const { error } = await supabase.from("pelada_automatic_admins").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao remover admin");
      return;
    }

    toast.success("Admin removido do sistema");
    loadData();
  };

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to="/auth" replace />;

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-muted-foreground">Você não tem permissão para acessar este painel.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl text-primary sm:text-2xl">PAINEL ADMINISTRATIVO DO SISTEMA</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">Gerencie acessos automáticos e admins globais</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl space-y-5 px-4 py-5">
        {/* Automatic Members Section */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">MEMBROS COM ACESSO AUTOMÁTICO</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Usuários nesta lista entram automaticamente em todas as peladas novas. Eles foram aprovados uma vez e não precisam solicitar novamente.
          </p>

          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Buscar por nome..."
              value={searchMemberEmail}
              onChange={(e) => setSearchMemberEmail(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addAutomaticMember()}
              className="border-border bg-secondary"
            />
            <Button onClick={addAutomaticMember} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="space-y-2">
            {automaticMembers.length === 0 ? (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Nenhum membro com acesso automático</p>
            ) : (
              automaticMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-2">
                  <div>
                    <p className="text-sm text-foreground">{member.display_name}</p>
                    <p className="text-xs text-muted-foreground">{member.user_id}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeAutomaticMember(member.id)}
                    className="gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Automatic Admins Section */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg text-foreground">ADMINS DO SISTEMA</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Usuários nesta lista são admins de TODAS as peladas e do sistema. Eles são auto-promovidos quando delegados como admin em qualquer pelada.
          </p>

          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Buscar por nome..."
              value={searchAdminEmail}
              onChange={(e) => setSearchAdminEmail(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addAutomaticAdmin()}
              className="border-border bg-secondary"
            />
            <Button onClick={addAutomaticAdmin} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="space-y-2">
            {automaticAdmins.length === 0 ? (
              <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">Nenhum admin do sistema</p>
            ) : (
              automaticAdmins.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-2">
                  <div>
                    <p className="text-sm text-foreground">{admin.display_name}</p>
                    <p className="text-xs text-muted-foreground">{admin.user_id}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeAutomaticAdmin(admin.id)}
                    className="gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
          <h3 className="mb-2 font-semibold text-foreground">Como funciona?</h3>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>
              <strong>Acesso Automático:</strong> Quando um membro é aprovado em uma pelada, ele entra automaticamente nesta lista e passa a entrar automaticamente em todas as novas peladas.
            </li>
            <li>
              <strong>Admins Automáticos:</strong> Quando um admin é delegado em qualquer pelada, ele é promovido automaticamente a admin de TODAS as peladas do sistema.
            </li>
            <li>
              <strong>Super Admin:</strong> Apenas super admins podem gerenciar estas listas globais.
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default AdminSystem;
