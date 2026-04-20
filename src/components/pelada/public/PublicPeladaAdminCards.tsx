import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GuestRow, MemberRow, UserProfileRow } from "@/components/pelada/public/types";

type PublicPeladaSystemMemberCardProps = {
  systemMemberSearch: string;
  onSystemMemberSearchChange: (value: string) => void;
  isSearchingSystemMembers: boolean;
  systemMemberResults: UserProfileRow[];
  addingSystemMemberUserId: string | null;
  onAddSystemMember: (profile: UserProfileRow) => void;
};

export const PublicPeladaSystemMemberCard = ({
  systemMemberSearch,
  onSystemMemberSearchChange,
  isSearchingSystemMembers,
  systemMemberResults,
  addingSystemMemberUserId,
  onAddSystemMember,
}: PublicPeladaSystemMemberCardProps) => (
  <div className="rounded-xl border border-border/50 bg-card p-5">
    <h2 className="mb-3 font-display text-lg text-foreground">ADICIONAR MEMBRO DO SISTEMA</h2>
    <p className="mb-3 text-xs text-muted-foreground">
      Use essa busca para confirmar alguém diretamente na lista sem depender da solicitação de entrada.
    </p>
    <Input
      placeholder="Buscar por nome do perfil"
      value={systemMemberSearch}
      onChange={(e) => onSystemMemberSearchChange(e.target.value)}
      className="mb-3 border-border bg-secondary"
    />

    {systemMemberSearch.trim().length < 2 ? (
      <p className="text-xs text-muted-foreground">Digite ao menos 2 letras para buscar membros do sistema.</p>
    ) : isSearchingSystemMembers ? (
      <p className="text-xs text-muted-foreground">Buscando membros do sistema...</p>
    ) : systemMemberResults.length === 0 ? (
      <p className="text-xs text-muted-foreground">Nenhum membro disponível para adicionar.</p>
    ) : (
      <div className="space-y-2">
        {systemMemberResults.map((profile) => (
          <div key={profile.user_id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{profile.display_name || "Usuário sem nome"}</p>
            </div>
            <Button
              size="sm"
              onClick={() => onAddSystemMember(profile)}
              disabled={addingSystemMemberUserId === profile.user_id}
            >
              {addingSystemMemberUserId === profile.user_id ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        ))}
      </div>
    )}
  </div>
);

type PublicPeladaPendingGuestsCardProps = {
  pendingGuestRequests: GuestRow[];
  members: MemberRow[];
  getMemberDisplayName: (member: MemberRow) => string;
  onReviewGuest: (guestId: string, status: "approved" | "rejected") => void;
};

export const PublicPeladaPendingGuestsCard = ({
  pendingGuestRequests,
  members,
  getMemberDisplayName,
  onReviewGuest,
}: PublicPeladaPendingGuestsCardProps) => (
  <div className="rounded-xl border border-border/50 bg-card p-5">
    <h2 className="mb-2 font-display text-lg text-foreground">APROVAR CONVIDADOS</h2>
    <p className="mb-3 text-xs text-muted-foreground">
      Essa área aparece só para admins. Os convidados entram na lista apenas depois da aprovação.
    </p>

    <div className="space-y-2">
      {pendingGuestRequests.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem convidados pendentes de aprovação.</p>
      ) : (
        pendingGuestRequests.map((guest) => {
          const hostMember = members.find((member) => member.id === guest.pelada_member_id);
          const hostName = hostMember ? getMemberDisplayName(hostMember) : "responsável removido";

          return (
            <div key={guest.id} className="rounded-md border border-border bg-secondary/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-foreground">{guest.guest_name}</p>
                  <p className="text-xs text-muted-foreground">Responsável: {hostName}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => onReviewGuest(guest.id, "approved")} className="gap-1">
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onReviewGuest(guest.id, "rejected")} className="gap-1">
                    <X className="h-3.5 w-3.5" /> Recusar
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);