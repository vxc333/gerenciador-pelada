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

const TWO_HOURS = 2 * 60 * 60 * 1000;

function parsePeladaStart(date?: string, time?: string): Date | null {
  if (!date) return null;

  // Normalize time into HH:MM:SS
  let hhmmss = "12:00:00";
  if (time && typeof time === "string") {
    const hhmmMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (hhmmMatch) {
      const hh = hhmmMatch[1].padStart(2, "0");
      const mm = hhmmMatch[2];
      const ss = hhmmMatch[3] || "00";
      hhmmss = `${hh}:${mm}:${ss}`;
    } else {
      const numMatch = time.match(/(\d{1,2})/);
      if (numMatch) {
        const hh = numMatch[1].padStart(2, "0");
        hhmmss = `${hh}:00:00`;
      }
    }
  }

  // Build local ISO-like string so Date parses in local timezone
  const isoLocal = `${date}T${hhmmss}`;
  const d = new Date(isoLocal);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Calcula estatísticas de participação do usuário
 * Inclui peladas passadas (date < hoje)
 */
export async function calculateParticipationStats(userId: string): Promise<ParticipationStats> {
  if (!userId) {
    return {
      totalParticipated: 0,
      totalConfirmed: 0,
      totalNoShow: 0,
      confirmationRate: 0,
      badges: [],
    };
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Step 1: Buscar peladas com data <= hoje (inclui peladas de hoje que possam já ter ocorrido)
  const { data: candidatePeladas, error: candidateError } = await supabase
    .from("peladas")
    .select("id, date, time")
    .lte("date", today);

  if (candidateError || !candidatePeladas || candidatePeladas.length === 0) {
    return {
      totalParticipated: 0,
      totalConfirmed: 0,
      totalNoShow: 0,
      confirmationRate: 0,
      badges: [],
    };
  }

  // Filtrar apenas as peladas cujo início + 2h já passou
  const pastPeladasList = (candidatePeladas || []).filter((p) => {
    const start = parsePeladaStart(p.date, (p as any).time);
    if (!start) return false;
    return start.getTime() + TWO_HOURS <= now.getTime();
  });

  if (pastPeladasList.length === 0) {
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
  const { data: pastMemberships, error: membershipsError } = await supabase
    .from("pelada_members")
    .select("*")
    .eq("user_id", userId)
    .in("pelada_id", pastPeladaIds);

  if (membershipsError || !pastMemberships) {
    console.error("Error fetching past peladas memberships:", membershipsError);
    return {
      totalParticipated: 0,
      totalConfirmed: 0,
      totalNoShow: 0,
      confirmationRate: 0,
      badges: [],
    };
  }

  // Contar confirmações e no-shows
  const totalParticipated = pastMemberships.length;
  const totalConfirmed = (pastMemberships as unknown as Array<{ status?: string }>).filter((member) => member.status === "confirmed").length;
  const totalNoShow = totalParticipated - totalConfirmed;

  const confirmationRate = totalParticipated > 0 ? Math.round((totalConfirmed / totalParticipated) * 100) : 0;

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
      label: "Veterano",
      icon: "",
      description: "100+ peladas jogadas",
    });
  } else if (total >= 50) {
    badges.push({
      id: "enthusiast",
      label: "Entusiasta",
      icon: "",
      description: "50+ peladas jogadas",
    });
  } else if (total >= 10) {
    badges.push({
      id: "regular",
      label: "Regular",
      icon: "",
      description: "10+ peladas jogadas",
    });
  } else if (total >= 5) {
    badges.push({
      id: "participant",
      label: "Participante",
      icon: "",
      description: "5+ peladas jogadas",
    });
  }

  // Confiabilidade badges
  if (confirmationRate === 100 && total >= 5) {
    badges.push({
      id: "reliable",
      label: "100% Confiavel",
      icon: "",
      description: "100% de confirmação",
    });
  } else if (confirmationRate >= 90 && total >= 10) {
    badges.push({
      id: "dependable",
      label: "Responsavel",
      icon: "",
      description: "90%+ de confirmação",
    });
  } else if (confirmationRate >= 80 && total >= 5) {
    badges.push({
      id: "committed",
      label: "Comprometido",
      icon: "",
      description: "80%+ de confirmação",
    });
  }

  // Penalidade: muitos no-shows
  if (noShow >= 5 && confirmationRate < 50) {
    badges.push({
      id: "unreliable",
      label: "Pouco Confiavel",
      icon: "",
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
  const fetchLimit = Math.min(Math.max(limit * 4, 40), 200);

  const { data: history, error } = await supabase
    .from("pelada_members")
    .select("id, pelada_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    console.error("Error fetching pelada history:", error);
    return [];
  }

  if (!history || !Array.isArray(history)) return [];

  // Buscar detalhes das peladas (pegar campos de data e hora)
  const peladaIds = (history as unknown as Array<{ pelada_id?: string }>)
    .map((h) => h.pelada_id)
    .filter(Boolean);
  if (peladaIds.length === 0) return [];

  const { data: peladas, error: peladasError } = await supabase
    .from("peladas")
    .select("id, title, date, time, location")
    .in("id", peladaIds);

  if (peladasError || !peladas) return [];

  const peladasMap = new Map((peladas as Array<any>).map((p) => [p.id, p]));

  const mappedHistory = (history as unknown as Array<{ pelada_id?: string; id?: string; created_at?: string }>)
    .map((entry) => {
      const pelada = peladasMap.get(entry.pelada_id);
      if (!pelada) return null;

      const happeningDate = parsePeladaStart(pelada.date, pelada.time) || new Date(`${pelada.date || "1970-01-01"}T12:00:00`);
      // Consideramos histórico apenas se o evento já tiver passado e passado há pelo menos 2 horas
      if (happeningDate.getTime() + TWO_HOURS > now.getTime()) return null;

      return {
        id: entry.id || "",
        peladaId: entry.pelada_id || "",
        peladaTitle: pelada.title || "Pelada",
        peladaDate: pelada.date ? `${pelada.date}T${(pelada.time || "12:00:00")}` : new Date().toISOString(),
        peladaLocation: pelada.location || "Local desconhecido",
        status: "confirmed" as const,
        confirmed: true,
        createdAt: entry.created_at || new Date().toISOString(),
        sortAt: happeningDate.getTime(),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      peladaId: string;
      peladaTitle: string;
      peladaDate: string;
      peladaLocation: string;
      status: "confirmed";
      confirmed: true;
      createdAt: string;
      sortAt: number;
    }>;

  return mappedHistory
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, limit)
    .map(({ sortAt, ...rest }) => rest);
}
