import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export interface ParticipationStats {
  totalParticipated: number;
  totalConfirmed: number;
  totalNoShow: number;
  confirmationRate: number; // 0-100
  badges: Badge[];
}

export interface Badge {
  id: string;
  label: string;
  icon: string;
  description: string;
}

type PeladaRow = Tables<"peladas">;
type MemberRow = Tables<"pelada_members">;

/**
 * Calcula estatísticas de participação do usuário
 * Inclui peladas passadas (happening_at < now)
 */
export async function calculateParticipationStats(userId: string): Promise<ParticipationStats> {
  const now = new Date().toISOString();

  // Buscar todas as peladas onde o usuário foi membro E a pelada já passou
  const { data: pastPeladas, error: peladasError } = await supabase
    .from("pelada_members")
    .select(
      `
      *,
      peladas!inner(id, happening_at, confirmations_open_at, confirmations_close_at)
    `
    )
    .eq("user_id", userId)
    .lt("peladas.happening_at", now);

  if (peladasError || !pastPeladas) {
    console.error("Error fetching past peladas:", peladasError);
    return {
      totalParticipated: 0,
      totalConfirmed: 0,
      totalNoShow: 0,
      confirmationRate: 0,
      badges: [],
    };
  }

  // Contar confirmações e no-shows
  const totalParticipated = pastPeladas.length;
  const totalConfirmed = (pastPeladas as unknown as Array<{ status: string }>).filter((member) => member.status === "confirmed").length;
  const totalNoShow = totalParticipated - totalConfirmed; // Se não confirmou, é no-show

  const confirmationRate = totalParticipated > 0 ? Math.round((totalConfirmed / totalParticipated) * 100) : 0;

  // Gerar badges
  const badges = generateBadges(totalParticipated, confirmationRate, totalNoShow);

  return {
    totalParticipated,
    totalConfirmed,
    totalNoShow,
    confirmationRate,
    badges,
  };
}

/**
 * Gera badges baseado em stats
 */
function generateBadges(total: number, confirmationRate: number, noShow: number): Badge[] {
  const badges: Badge[] = [];

  // Experiência badges
  if (total >= 100) {
    badges.push({
      id: "veteran",
      label: "🎖️ Veterano",
      icon: "🎖️",
      description: "100+ peladas jogadas",
    });
  } else if (total >= 50) {
    badges.push({
      id: "enthusiast",
      label: "🔥 Entusiasta",
      icon: "🔥",
      description: "50+ peladas jogadas",
    });
  } else if (total >= 10) {
    badges.push({
      id: "regular",
      label: "⭐ Regular",
      icon: "⭐",
      description: "10+ peladas jogadas",
    });
  } else if (total >= 5) {
    badges.push({
      id: "participant",
      label: "👟 Participante",
      icon: "👟",
      description: "5+ peladas jogadas",
    });
  }

  // Confiabilidade badges
  if (confirmationRate === 100 && total >= 5) {
    badges.push({
      id: "reliable",
      label: "✅ 100% Confiável",
      icon: "✅",
      description: "100% de confirmação",
    });
  } else if (confirmationRate >= 90 && total >= 10) {
    badges.push({
      id: "dependable",
      label: "👌 Responsável",
      icon: "👌",
      description: "90%+ de confirmação",
    });
  } else if (confirmationRate >= 80 && total >= 5) {
    badges.push({
      id: "committed",
      label: "💪 Comprometido",
      icon: "💪",
      description: "80%+ de confirmação",
    });
  }

  // Penalidade: muitos no-shows
  if (noShow >= 5 && confirmationRate < 50) {
    badges.push({
      id: "unreliable",
      label: "⚠️ Pouco Confiável",
      icon: "⚠️",
      description: "Muitos no-shows",
    });
  }

  return badges;
}

/**
 * Busca peladas passadas do usuário com informações de participação
 */
export async function getUserPeladaHistory(userId: string, limit: number = 20) {
  const now = new Date().toISOString();

  const { data: history, error } = await supabase
    .from("pelada_members")
    .select(
      `
      *,
      peladas!inner(id, title, happening_at, confirmations_open_at, confirmations_close_at, location, user_id)
    `
    )
    .eq("user_id", userId)
    .lt("peladas.happening_at", now)
    .order("peladas(happening_at)", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching pelada history:", error);
    return [];
  }

  return (
    (history as unknown as Array<{ id: string; pelada_id: string; status: string; created_at: string; peladas?: { title?: string; happening_at?: string; location?: string } }>)?.map((entry) => ({
      id: entry.id,
      peladaId: entry.pelada_id,
      peladaTitle: entry.peladas?.title || "Pelada",
      peladaDate: entry.peladas?.happening_at,
      peladaLocation: entry.peladas?.location,
      status: entry.status as "confirmed" | "unconfirmed",
      confirmed: entry.status === "confirmed",
      createdAt: entry.created_at,
    })) || []
  );
}
