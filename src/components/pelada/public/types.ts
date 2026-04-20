import type { Tables } from "@/integrations/supabase/types";

export type DrawTeam = { team: number; players: string[] };
export type PeladaRow = Omit<Tables<"peladas">, "draw_result"> & { draw_result: DrawTeam[] | null };
export type MemberRow = Tables<"pelada_members">;
export type GuestRow = Tables<"pelada_member_guests">;
export type JoinRequestRow = Tables<"pelada_join_requests">;
export type UserProfileRow = Tables<"user_profiles">;