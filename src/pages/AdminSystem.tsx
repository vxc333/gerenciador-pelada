import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageContent, PageSectionCard } from "@/components/layout/PageLayout";
import { PageState } from "@/components/layout/PageState";
import { SystemAccessSection } from "@/components/admin/SystemAccessSection";
import type { Tables } from "@/integrations/supabase/types";

type UserProfileRow = Tables<"user_profiles">;
type SearchableUserProfile = Pick<UserProfileRow, "user_id" | "display_name">;

interface AutomaticAccessEntry {
  id: string;
  user_id: string;
  display_name: string;
  created_at: string;
}

type AccessTable = "pelada_automatic_members" | "pelada_automatic_admins";

const AdminSystem = () => {
  const { user, loading, profileChecked } = useAuth();

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [automaticMembers, setAutomaticMembers] = useState<AutomaticAccessEntry[]>([]);
  const [automaticAdmins, setAutomaticAdmins] = useState<AutomaticAccessEntry[]>([]);
  const [searchMemberEmail, setSearchMemberEmail] = useState("");
  const [searchAdminEmail, setSearchAdminEmail] = useState("");

  const loadAccessEntries = useCallback(async (table: AccessTable) => {
    const { data } = await supabase
      .from(table)
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) return [];

    const userIds = data.map((row) => row.user_id);
    const { data: profiles } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", userIds);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((profile) => {
      profileMap[profile.user_id] = profile.display_name;
    });

    return data.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      display_name: profileMap[row.user_id] || "Usuário sem nome",
      created_at: row.created_at,
    }));
  }, []);

  const findProfileByName = useCallback(async (searchTerm: string): Promise<SearchableUserProfile | null> => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      toast.error("Digite um nome válido");
      return null;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${trimmed}%`)
      .single();

    if (!profile) {
      toast.error("Usuário não encontrado");
      return null;
    }

    return profile;
  }, []);

  // Check if user is super admin and load data
  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: superAdminRow } = await supabase.from("app_super_admins").select("user_id").eq("user_id", user.id).maybeSingle();

    if (!superAdminRow) {
      setIsSuperAdmin(false);
      return;
    }

    setIsSuperAdmin(true);

    const [members, admins] = await Promise.all([
      loadAccessEntries("pelada_automatic_members"),
      loadAccessEntries("pelada_automatic_admins"),
    ]);

    setAutomaticMembers(members);
    setAutomaticAdmins(admins);
  }, [loadAccessEntries, user]);

  useEffect(() => {
    if (user && profileChecked) {
      loadData();
    }
  }, [user, profileChecked, loadData]);

  const addAccessEntry = useCallback(
    async (
      table: AccessTable,
      searchValue: string,
      duplicateMessage: string,
      genericErrorMessage: string,
      successMessage: (displayName: string) => string,
      clearSearch: () => void
    ) => {
      const profile = await findProfileByName(searchValue);
      if (!profile) return;

      const payload =
        table === "pelada_automatic_admins"
          ? { user_id: profile.user_id, created_by: user?.id }
          : { user_id: profile.user_id };

      const { error } = await supabase.from(table).insert(payload);
      if (error) {
        if (error.code === "23505") {
          toast.error(duplicateMessage);
        } else {
          toast.error(genericErrorMessage);
        }
        return;
      }

      toast.success(successMessage(profile.display_name));
      clearSearch();
      loadData();
    },
    [findProfileByName, loadData, user?.id]
  );

  const removeAccessEntry = useCallback(
    async (table: AccessTable, id: string, errorMessage: string, successMessage: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);

      if (error) {
        toast.error(errorMessage);
        return;
      }

      toast.success(successMessage);
      loadData();
    },
    [loadData]
  );

  const addAutomaticMember = () => {
    addAccessEntry(
      "pelada_automatic_members",
      searchMemberEmail,
      "Este usuário já está na lista de acesso automático",
      "Erro ao adicionar usuário",
      (displayName) => `${displayName} adicionado ao acesso automático`,
      () => setSearchMemberEmail("")
    );
  };

  const addAutomaticAdmin = () => {
    addAccessEntry(
      "pelada_automatic_admins",
      searchAdminEmail,
      "Este usuário já é admin automático",
      "Erro ao adicionar admin",
      (displayName) => `${displayName} promovido a admin do sistema`,
      () => setSearchAdminEmail("")
    );
  };

  const removeAutomaticMember = (id: string) => {
    removeAccessEntry("pelada_automatic_members", id, "Erro ao remover usuário", "Usuário removido do acesso automático");
  };

  const removeAutomaticAdmin = (id: string) => {
    removeAccessEntry("pelada_automatic_admins", id, "Erro ao remover admin", "Admin removido do sistema");
  };

  if (loading || !profileChecked) return null;
  if (!user) return <Navigate to="/auth" replace />;

  if (!isSuperAdmin) {
    return <PageState message="Você não tem permissão para acessar este painel." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="PAINEL ADMINISTRATIVO DO SISTEMA"
        subtitle="Gerencie acessos automáticos e admins globais"
        backTo="/"
      />

      <PageContent className="max-w-2xl space-y-5">
        <SystemAccessSection
          title="MEMBROS COM ACESSO AUTOMÁTICO"
          description="Usuários nesta lista entram automaticamente em todas as peladas novas. Eles foram aprovados uma vez e não precisam solicitar novamente."
          placeholder="Buscar por nome..."
          searchValue={searchMemberEmail}
          onSearchChange={setSearchMemberEmail}
          onSubmit={addAutomaticMember}
          submitLabel="Adicionar"
          emptyLabel="Nenhum membro com acesso automático"
          entries={automaticMembers}
          onRemove={removeAutomaticMember}
        />

        <SystemAccessSection
          title="ADMINS DO SISTEMA"
          description="Usuários nesta lista são admins de TODAS as peladas e do sistema. Eles são auto-promovidos quando delegados como admin em qualquer pelada."
          placeholder="Buscar por nome..."
          searchValue={searchAdminEmail}
          onSearchChange={setSearchAdminEmail}
          onSubmit={addAutomaticAdmin}
          submitLabel="Adicionar"
          emptyLabel="Nenhum admin do sistema"
          entries={automaticAdmins}
          onRemove={removeAutomaticAdmin}
        />

        <PageSectionCard title="Como funciona?" className="border-border/50 bg-muted/30">
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
        </PageSectionCard>
      </PageContent>
    </div>
  );
};

export default AdminSystem;
