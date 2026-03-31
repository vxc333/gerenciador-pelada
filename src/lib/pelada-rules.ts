export type PeladaRules = {
  autoConfirmAdmins: boolean;
  maxGuestsPerMember: number;
  progressiveWarningHours: number;
};

const DEFAULT_RULES: PeladaRules = {
  autoConfirmAdmins: true,
  maxGuestsPerMember: 3,
  progressiveWarningHours: 24,
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
    })
  );
};
