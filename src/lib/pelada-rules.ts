export type PeladaRules = {
  autoConfirmAdmins: boolean;
  maxGuestsPerMember: number;
  progressiveWarningHours: number;
  drawDoNotPairPlayersText: string;
  drawAvoidSameHostGuests: boolean;
  drawEnsureGuestPerTeam: boolean;
  drawEnsureHostWithGuest: boolean;
  drawAvoidRecentPairs: boolean;
  drawRecentDrawsWindow: number;
};

const DEFAULT_RULES: PeladaRules = {
  autoConfirmAdmins: true,
  maxGuestsPerMember: 3,
  progressiveWarningHours: 24,
  drawDoNotPairPlayersText: "",
  drawAvoidSameHostGuests: true,
  drawEnsureGuestPerTeam: true,
  drawEnsureHostWithGuest: true,
  drawAvoidRecentPairs: true,
  drawRecentDrawsWindow: 2,
};

const keyFor = (peladaId: string) => `pelada-rules:${peladaId}`;

export const getPeladaRules = (peladaId: string): PeladaRules => {
  if (!peladaId) return DEFAULT_RULES;

  try {
    const raw = localStorage.getItem(keyFor(peladaId));
    if (!raw) return DEFAULT_RULES;

    const parsed = JSON.parse(raw) as Partial<PeladaRules>;

    return {
      autoConfirmAdmins: parsed.autoConfirmAdmins ?? DEFAULT_RULES.autoConfirmAdmins,
      maxGuestsPerMember: Math.max(0, Math.floor(parsed.maxGuestsPerMember ?? DEFAULT_RULES.maxGuestsPerMember)),
      progressiveWarningHours: Math.max(1, Math.floor(parsed.progressiveWarningHours ?? DEFAULT_RULES.progressiveWarningHours)),
      drawDoNotPairPlayersText:
        typeof parsed.drawDoNotPairPlayersText === "string"
          ? parsed.drawDoNotPairPlayersText
          : DEFAULT_RULES.drawDoNotPairPlayersText,
      drawAvoidSameHostGuests: parsed.drawAvoidSameHostGuests ?? DEFAULT_RULES.drawAvoidSameHostGuests,
      drawEnsureGuestPerTeam: parsed.drawEnsureGuestPerTeam ?? DEFAULT_RULES.drawEnsureGuestPerTeam,
      drawEnsureHostWithGuest: parsed.drawEnsureHostWithGuest ?? DEFAULT_RULES.drawEnsureHostWithGuest,
      drawAvoidRecentPairs: parsed.drawAvoidRecentPairs ?? DEFAULT_RULES.drawAvoidRecentPairs,
      drawRecentDrawsWindow: Math.max(1, Math.min(5, Math.floor(parsed.drawRecentDrawsWindow ?? DEFAULT_RULES.drawRecentDrawsWindow))),
    };
  } catch {
    return DEFAULT_RULES;
  }
};

export const setPeladaRules = (peladaId: string, rules: PeladaRules) => {
  if (!peladaId) return;

  localStorage.setItem(
    keyFor(peladaId),
    JSON.stringify({
      autoConfirmAdmins: rules.autoConfirmAdmins,
      maxGuestsPerMember: Math.max(0, Math.floor(rules.maxGuestsPerMember)),
      progressiveWarningHours: Math.max(1, Math.floor(rules.progressiveWarningHours)),
      drawDoNotPairPlayersText: rules.drawDoNotPairPlayersText,
      drawAvoidSameHostGuests: rules.drawAvoidSameHostGuests,
      drawEnsureGuestPerTeam: rules.drawEnsureGuestPerTeam,
      drawEnsureHostWithGuest: rules.drawEnsureHostWithGuest,
      drawAvoidRecentPairs: rules.drawAvoidRecentPairs,
      drawRecentDrawsWindow: Math.max(1, Math.min(5, Math.floor(rules.drawRecentDrawsWindow))),
    })
  );
};
