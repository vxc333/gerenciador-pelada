import { ArrowDown, ArrowUp, Download, Link as LinkIcon, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { PeladaListEntry } from "@/lib/pelada-participants";
import type { MemberRow, PeladaRow } from "@/components/pelada/public/types";
import { getInitial } from "@/components/pelada/public/utils";

type PublicPeladaParticipantsCardProps = {
  pelada: PeladaRow;
  memberCount: number;
  memberCapacity: number;
  gkCount: number;
  gkCapacity: number;
  approvedGuestsCount: number;
  waitingEntriesCount: number;
  orderedListEntries: PeladaListEntry[];
  isAdmin: boolean;
  canManagePelada: boolean;
  currentUserId?: string;
  currentUserMemberId?: string;
  movingEntryId: string | null;
  removingMemberId: string | null;
  publicLink: string;
  onCopyFormattedList: () => void;
  onCopyPublicLink: () => void;
  onMoveEntry: (entry: PeladaListEntry, toWaiting: boolean) => void;
  onAdminRemoveMember: (member: MemberRow) => void;
  onRemoveGuest: (guestId: string) => void;
  getMemberDisplayName: (member: MemberRow) => string;
};

type ParticipantRowProps = {
  entry: PeladaListEntry;
  canManagePelada: boolean;
  movingEntryId: string | null;
  onMoveEntry: (entry: PeladaListEntry, toWaiting: boolean) => void;
};

const MoveEntryButton = ({ entry, canManagePelada, movingEntryId, onMoveEntry }: ParticipantRowProps) => {
  if (!canManagePelada) return null;

  const moveEntryId = `${entry.kind}-${entry.id}`;
  const isMovingThisEntry = movingEntryId === moveEntryId;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={() => onMoveEntry(entry, !entry.isWaiting)}
      disabled={isMovingThisEntry}
      title={entry.isWaiting ? "Subir para lista principal" : "Mover para lista de espera"}
    >
      {entry.isWaiting ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
    </Button>
  );
};

type MemberRowCardProps = ParticipantRowProps & {
  member: MemberRow;
  displayName: string;
  showPriority: boolean;
  canRemoveMember: boolean;
  removingMemberId: string | null;
  onAdminRemoveMember: (member: MemberRow) => void;
};

const MemberRowCard = ({
  entry,
  member,
  displayName,
  showPriority,
  canManagePelada,
  movingEntryId,
  onMoveEntry,
  canRemoveMember,
  removingMemberId,
  onAdminRemoveMember,
}: MemberRowCardProps) => (
  <div className="rounded-md border border-border bg-secondary/50 p-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarImage src={member.member_avatar_url || undefined} alt={displayName} />
          <AvatarFallback className="text-[11px] font-semibold">{getInitial(displayName)}</AvatarFallback>
        </Avatar>
        <span className="text-sm text-foreground">
          {displayName}
          {entry.isGoalkeeper ? " (goleiro)" : ""}
          {entry.isWaiting ? " (espera)" : ""}
          {showPriority ? ` (prio ${member.priority_score})` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {entry.isWaiting ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">espera</span> : null}
        <MoveEntryButton entry={entry} canManagePelada={canManagePelada} movingEntryId={movingEntryId} onMoveEntry={onMoveEntry} />
        {canRemoveMember && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onAdminRemoveMember(member)}
            disabled={removingMemberId === member.id}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  </div>
);

type GuestRowCardProps = ParticipantRowProps & {
  hostLabel: string;
  canDelete: boolean;
  onRemoveGuest: (guestId: string) => void;
};

const GuestRowCard = ({ entry, hostLabel, canManagePelada, movingEntryId, onMoveEntry, canDelete, onRemoveGuest }: GuestRowCardProps) => {
  if (entry.kind !== "guest") return null;

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px] font-semibold">{getInitial(entry.guest.guest_name)}</AvatarFallback>
          </Avatar>
          <span className="text-foreground">
            {entry.guest.guest_name}
            {entry.isWaiting ? " (espera)" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {entry.isWaiting ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">espera</span> : null}
          <MoveEntryButton entry={entry} canManagePelada={canManagePelada} movingEntryId={movingEntryId} onMoveEntry={onMoveEntry} />
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveGuest(entry.guest.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">Responsável: {hostLabel}</p>
    </div>
  );
};

export const PublicPeladaParticipantsCard = ({
  pelada,
  memberCount,
  memberCapacity,
  gkCount,
  gkCapacity,
  approvedGuestsCount,
  waitingEntriesCount,
  orderedListEntries,
  isAdmin,
  canManagePelada,
  currentUserId,
  currentUserMemberId,
  movingEntryId,
  removingMemberId,
  publicLink,
  onCopyFormattedList,
  onCopyPublicLink,
  onMoveEntry,
  onAdminRemoveMember,
  onRemoveGuest,
  getMemberDisplayName,
}: PublicPeladaParticipantsCardProps) => (
  <div className="rounded-xl border border-border/50 bg-card p-5">
    <h2 className="mb-3 font-display text-lg text-foreground">LISTA</h2>
    <div className="mb-2 flex gap-2 text-xs">
      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-primary">Jogadores: {memberCount}/{memberCapacity}</span>
      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-accent">Goleiros: {gkCount}/{gkCapacity}</span>
      <span className="rounded-full bg-secondary px-2 py-0.5 text-foreground">Convidados aprovados: {approvedGuestsCount}</span>
    </div>
    <p className="mb-2 text-xs text-muted-foreground">
      Membros e convidados entram na mesma lista. Ordem dos membros: {pelada.list_priority_mode === "member_priority" ? "prioridade" : "confirmação"} | convidados: {pelada.guest_priority_mode === "guest_added_order" ? "ordem de adição" : "junto do responsável"}
    </p>
    {waitingEntriesCount > 0 && <p className="mb-2 text-xs text-muted-foreground">Lista de espera atual: {waitingEntriesCount}</p>}

    <div className="mb-2 flex gap-2">
      {isAdmin && (
        <Button onClick={onCopyFormattedList} className="flex-1 gap-2 text-sm">
          <Download className="h-4 w-4" /> Copiar lista
        </Button>
      )}
    </div>

    <div className="rounded-md border border-border bg-secondary/30 p-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participantes</p>
      <div className="space-y-2">
        {orderedListEntries.map((entry) => {
          if (entry.kind === "member") {
            const displayName = getMemberDisplayName(entry.member);
            const canRemoveMember = canManagePelada && entry.member.user_id !== currentUserId;

            return (
              <MemberRowCard
                key={entry.member.id}
                entry={entry}
                member={entry.member}
                displayName={displayName}
                showPriority={pelada.list_priority_mode === "member_priority"}
                canManagePelada={canManagePelada}
                movingEntryId={movingEntryId}
                onMoveEntry={onMoveEntry}
                canRemoveMember={canRemoveMember}
                removingMemberId={removingMemberId}
                onAdminRemoveMember={onAdminRemoveMember}
              />
            );
          }

          return (
            <GuestRowCard
              key={entry.guest.id}
              entry={entry}
              hostLabel={entry.hostMember ? getMemberDisplayName(entry.hostMember) : "participante removido"}
              canManagePelada={canManagePelada}
              movingEntryId={movingEntryId}
              onMoveEntry={onMoveEntry}
              canDelete={!!currentUserMemberId && entry.guest.pelada_member_id === currentUserMemberId}
              onRemoveGuest={onRemoveGuest}
            />
          );
        })}
        {orderedListEntries.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground">Sem participantes confirmados</p>
        )}
      </div>
    </div>

    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
      <div className="break-words">
        Link público: <a href={publicLink} className="text-primary underline">{publicLink}</a>
      </div>
      <div>
        <Button variant="secondary" size="sm" onClick={onCopyPublicLink}>
          <LinkIcon className="h-4 w-4" /> Copiar link
        </Button>
      </div>
    </div>

    {orderedListEntries.length === 0 && <p className="mt-3 py-3 text-center text-sm text-muted-foreground">Ninguém confirmou ainda</p>}
  </div>
);