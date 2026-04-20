import { Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type PublicPeladaConfirmationCardProps = {
  canConfirm: boolean;
  formatOpenAtLabel: string;
  showProgressiveWarning: boolean;
  progressiveWarningHours: number;
  isAdmin: boolean;
  memberName: string;
  onMemberNameChange: (value: string) => void;
  isGoalkeeper: boolean;
  onGoalkeeperChange: (checked: boolean) => void;
  onConfirm: () => void;
  onRemove: () => void;
  hasMember: boolean;
  isBanned: boolean;
  disableConfirm: boolean;
  myMemberIsWaiting: boolean;
  myWaitingPosition: number;
};

export const PublicPeladaConfirmationCard = ({
  canConfirm,
  formatOpenAtLabel,
  showProgressiveWarning,
  progressiveWarningHours,
  isAdmin,
  memberName,
  onMemberNameChange,
  isGoalkeeper,
  onGoalkeeperChange,
  onConfirm,
  onRemove,
  hasMember,
  isBanned,
  disableConfirm,
  myMemberIsWaiting,
  myWaitingPosition,
}: PublicPeladaConfirmationCardProps) => (
  <div className="rounded-xl border border-primary/30 bg-card p-5">
    <h2 className="mb-2 font-display text-lg text-foreground">CONFIRME SUA PRESENÇA</h2>

    {!canConfirm && (
      <p className="mb-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        Confirmações abertas em {formatOpenAtLabel}.
      </p>
    )}

    {showProgressiveWarning && (
      <p className="mb-3 rounded-md bg-accent/10 p-2 text-xs text-accent">
        Faltam menos de {progressiveWarningHours}h para abrir as confirmações.
      </p>
    )}

    {isAdmin ? (
      <p className="mb-3 rounded-md bg-accent/10 p-2 text-xs text-accent">
        Você é admin desta pelada e já entra automaticamente na lista com o nome do seu perfil.
      </p>
    ) : (
      <div className="mb-3">
        <label className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          Seu nome <span className="text-destructive">*</span> obrigatório
        </label>
        <Input
          placeholder="Digite seu nome"
          value={memberName}
          onChange={(e) => onMemberNameChange(e.target.value)}
          className="border-border bg-secondary"
        />
        {memberName.length === 0 && (
          <p className="mt-1 text-xs text-destructive">Nome é obrigatório para confirmar presença</p>
        )}
      </div>
    )}

    <div className="mb-3 flex items-center gap-2">
      <Checkbox id="goalkeeper" checked={isGoalkeeper} onCheckedChange={(checked) => onGoalkeeperChange(!!checked)} />
      <label htmlFor="goalkeeper" className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground">
        <Shield className="h-3.5 w-3.5" /> Sou goleiro
      </label>
    </div>

    <div className="flex gap-2">
      <Button onClick={onConfirm} className="flex-1" disabled={disableConfirm}>
        {hasMember ? "Atualizar minha confirmação" : "Confirmar presença"}
      </Button>
      {hasMember && (
        <Button variant="destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>

    {myMemberIsWaiting && (
      <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        Você está na lista de espera. Posição atual: {myWaitingPosition || "-"}. Quando surgir vaga, o primeiro da fila sobe automaticamente.
      </p>
    )}
  </div>
);