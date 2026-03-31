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
 * Inclui peladas passadas (date < hoje)
 */
export async function calculateParticipationStats(userId: string): Promise<ParticipationStats> {
  const today = new Date().toISOString().slice(0, 10);

  // Step 1: Buscar todas as peladas que já passaram
  const { data: pastPeladasList, error: pastPeladasError } = await supabase
    .from("peladas")
    .select("id, date")
    .lt("date", today);

  if (pastPeladasError || !pastPeladasList || pastPeladasList.length === 0) {
    return {
      totalParticipated: 0,
      totalConfirmed: 0,
      totalNoShow: 0,
      confirmationRate: 0,
      badges: [],
    };
  }

  const pastPeladaIds = pastPeladasList.map((p) => p.id);

  // Step 2: Buscar membros do usuário nessas peladas
  const { data: pastPeladas, error: peladasError } = await supabase
    .from("pelada_members")
    .select("*")
    .eq("user_id", userId)
    .in("pelada_id", pastPeladaIds);

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
  if (!userId) return [];
  
  const now = new Date();

  const { data: history, error } = await supabase
    .from("pelada_members")
    .select("id, pelada_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching pelada history:", error);
    return [];
  }

  if (!history || !Array.isArray(history)) {
    return [];
  }

  // Buscar detalhes das peladas
  const peladaIds = (history as unknown as Array<{ pelada_id?: string; id?: string; created_at?: string }>)
    .map((h) => h.pelada_id)
    .filter(Boolean);
  if (peladaIds.length === 0) return [];

  const { data: peladas, error: peladasError } = await supabase
    .from("peladas")
    .select("id, title, date, location");

  if (peladasError || !peladas) {
    return [];
  }

  // Criar mapa de peladas
  const peladasMap = new Map(
    (peladas as unknown as Array<{ id?: string; title?: string; date?: string; location?: string }>).map((p) => [p.id, p])
  );

  // Filtar apenas peladas passadas
  return (history as unknown as Array<{ pelada_id?: string; id?: string; created_at?: string }>)
    .map((entry) => {
      const pelada = peladasMap.get(entry.pelada_id);
      if (!pelada) return null;

      const happeningDate = new Date(`${pelada.date || "1970-01-01"}T12:00:00Z`);
      if (happeningDate > now) return null; // Apenas peladas passadas

      return {
        id: entry.id || "",
        peladaId: entry.pelada_id || "",
        peladaTitle: pelada.title || "Pelada",
        peladaDate: pelada.date ? `${pelada.date}T12:00:00Z` : new Date().toISOString(),
        peladaLocation: pelada.location || "Local desconhecido",
        status: "confirmed" as const,
        confirmed: true,
        createdAt: entry.created_at || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}
