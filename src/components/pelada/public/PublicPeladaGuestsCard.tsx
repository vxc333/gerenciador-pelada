import { Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { GuestRow } from "@/components/pelada/public/types";

type PublicPeladaGuestsCardProps = {
  maxGuestsPerMember: number;
  guestName: string;
  onGuestNameChange: (value: string) => void;
  onGuestKeyDown: (key: string) => void;
  onAddGuest: () => void;
  isGuestGoalkeeper: boolean;
  onGuestGoalkeeperChange: (checked: boolean) => void;
  hasMember: boolean;
  canAddGuest: boolean;
  myGuests: GuestRow[];
  onRemoveGuest: (guestId: string) => void;
};

export const PublicPeladaGuestsCard = ({
  maxGuestsPerMember,
  guestName,
  onGuestNameChange,
  onGuestKeyDown,
  onAddGuest,
  isGuestGoalkeeper,
  onGuestGoalkeeperChange,
  hasMember,
  canAddGuest,
  myGuests,
  onRemoveGuest,
}: PublicPeladaGuestsCardProps) => (
  <div className="rounded-xl border border-border/50 bg-card p-5">
    <h2 className="mb-2 font-display text-lg text-foreground">CONVIDADOS</h2>
    <p className="mb-3 text-xs text-muted-foreground">
      Só você pode adicionar/remover seus convidados. Cada convidado precisa de aprovação de admin para entrar na lista principal. Limite por membro: {maxGuestsPerMember}.
    </p>
    <div className="mb-3 flex gap-2">
      <Input
        placeholder="Nome do convidado"
        value={guestName}
        onChange={(e) => onGuestNameChange(e.target.value)}
        onKeyDown={(e) => onGuestKeyDown(e.key)}
        className="border-border bg-secondary"
        disabled={!hasMember}
      />
      <Button onClick={onAddGuest} disabled={!canAddGuest}>
        Adicionar
      </Button>
    </div>
    <div className="mb-3 flex items-center gap-2">
      <Checkbox
        id="guest-goalkeeper"
        checked={isGuestGoalkeeper}
        onCheckedChange={(checked) => onGuestGoalkeeperChange(!!checked)}
      />
      <label htmlFor="guest-goalkeeper" className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground">
        <Shield className="h-3.5 w-3.5" /> Convidado goleiro
      </label>
    </div>
    {!hasMember && <p className="text-xs text-muted-foreground">Confirme sua presença para liberar convidados.</p>}

    {hasMember && (
      <div className="mt-2 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meus convidados</p>
        {myGuests.length === 0 ? (
          <p className="text-xs text-muted-foreground">Você ainda não adicionou convidados.</p>
        ) : (
          myGuests.map((guest) => {
            const statusLabel =
              guest.approval_status === "approved"
                ? "aprovado"
                : guest.approval_status === "rejected"
                  ? "recusado"
                  : "aguardando aprovação";

            return (
              <div key={guest.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                <div>
                  <p className="text-sm text-foreground">{guest.guest_name}</p>
                  <p className="text-[11px] text-muted-foreground">Status: {statusLabel}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveGuest(guest.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    )}
  </div>
);