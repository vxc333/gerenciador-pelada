import type { Tables } from "@/integrations/supabase/types";

type PeladaOrdering = Pick<Tables<"peladas">, "guest_priority_mode" | "list_priority_mode">;
type MemberRow = Tables<"pelada_members">;
type GuestRow = Tables<"pelada_member_guests">;

export type PeladaListEntry =
  | {
      kind: "member";
      id: string;
      member: MemberRow;
      hostMember: MemberRow;
      createdAt: string;
      hostCreatedAt: string;
      priorityScore: number;
      isGoalkeeper: boolean;
      isWaiting: boolean;
    }
  | {
      kind: "guest";
      id: string;
      guest: GuestRow;
      hostMember: MemberRow | null;
      createdAt: string;
      hostCreatedAt: string;
      priorityScore: number;
      isGoalkeeper: boolean;
      isWaiting: boolean;
    };

export const isGoalkeeperGuestName = (guestName: string) => /\(goleiro\)\s*$/i.test(guestName);

export const sortPeladaMembers = (members: MemberRow[], listPriorityMode: PeladaOrdering["list_priority_mode"]) => {
  const orderedMembers = [...members];

  orderedMembers.sort((a, b) => {
    if (listPriorityMode === "member_priority" && b.priority_score !== a.priority_score) {
      return b.priority_score - a.priority_score;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return orderedMembers;
};

export const buildOrderedPeladaEntries = (
  pelada: PeladaOrdering,
  members: MemberRow[],
  guests: GuestRow[]
): PeladaListEntry[] => {
  const sortedMembers = sortPeladaMembers(members, pelada.list_priority_mode);
  const memberOrder = new Map<string, number>();
  const membersById = new Map<string, MemberRow>();

  sortedMembers.forEach((member, index) => {
    memberOrder.set(member.id, index);
    membersById.set(member.id, member);
  });

  const entries: PeladaListEntry[] = [
    ...sortedMembers.map((member) => ({
      kind: "member" as const,
      id: member.id,
      member,
      hostMember: member,
      createdAt: member.created_at,
      hostCreatedAt: member.created_at,
      priorityScore: member.priority_score,
      isGoalkeeper: member.is_goalkeeper,
      isWaiting: member.is_waiting,
    })),
    ...guests.map((guest) => {
      const hostMember = membersById.get(guest.pelada_member_id) || null;

      return {
        kind: "guest" as const,
        id: guest.id,
        guest,
        hostMember,
        createdAt: guest.created_at,
        hostCreatedAt: hostMember?.created_at || guest.created_at,
        priorityScore: hostMember?.priority_score || 0,
        isGoalkeeper: isGoalkeeperGuestName(guest.guest_name),
        isWaiting: guest.is_waiting,
      };
    }),
  ];

  entries.sort((a, b) => {
    if (pelada.list_priority_mode === "member_priority" && b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    if (pelada.guest_priority_mode === "grouped_with_member") {
      const hostOrderA = a.hostMember ? (memberOrder.get(a.hostMember.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const hostOrderB = b.hostMember ? (memberOrder.get(b.hostMember.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

      if (hostOrderA !== hostOrderB) return hostOrderA - hostOrderB;
      if (a.kind !== b.kind) return a.kind === "member" ? -1 : 1;

      const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id);
    }

    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;
    if (a.kind !== b.kind) return a.kind === "member" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return entries;
};