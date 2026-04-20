import type { Json } from "@/integrations/supabase/types";
import type { DrawTeam } from "@/components/pelada/public/types";

export const parseDrawResult = (value: Json | null): DrawTeam[] | null => {
  if (!Array.isArray(value)) return null;

  const parsed = value
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;

      const rawTeam = (item as { team?: Json }).team;
      const rawPlayers = (item as { players?: Json }).players;

      if (typeof rawTeam !== "number" || !Array.isArray(rawPlayers)) return null;
      if (!rawPlayers.every((player) => typeof player === "string")) return null;

      return {
        team: rawTeam,
        players: rawPlayers,
      };
    })
    .filter((team): team is DrawTeam => team !== null);

  return parsed;
};

export const getInitial = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
};