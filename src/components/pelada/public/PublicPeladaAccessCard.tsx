import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { JoinRequestRow } from "@/components/pelada/public/types";

type PublicPeladaAccessCardProps = {
  isBanned: boolean;
  canAccessPelada: boolean;
  profileHasName: boolean;
  myJoinRequest: JoinRequestRow | null;
  onRequestAccess: () => void;
};

export const PublicPeladaAccessCard = ({
  isBanned,
  canAccessPelada,
  profileHasName,
  myJoinRequest,
  onRequestAccess,
}: PublicPeladaAccessCardProps) => {
  if (isBanned || canAccessPelada) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <h2 className="mb-2 font-display text-lg text-foreground">ENTRADA NA PELADA</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Para confirmar presença, o admin precisa aprovar sua entrada nesta pelada.
      </p>

      {!profileHasName ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Antes de solicitar entrada, complete seu nome no perfil.</p>
          <Link to="/">
            <Button className="w-full">Ir para meu perfil</Button>
          </Link>
        </div>
      ) : myJoinRequest?.status === "pending" ? (
        <Button className="w-full" disabled>
          Solicitação enviada (aguardando)
        </Button>
      ) : myJoinRequest?.status === "rejected" ? (
        <Button className="w-full" disabled>
          Solicitação recusada pelo admin
        </Button>
      ) : (
        <Button onClick={onRequestAccess} className="w-full">
          Solicitar entrada
        </Button>
      )}
    </div>
  );
};