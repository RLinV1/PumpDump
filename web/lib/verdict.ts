// Verdicts use amber only. Green and red are reserved for price direction, so a risk label never reads as buy or sell.
export function verdictOf(score: number) {
  if (score >= 65) {
    return {
      label: "Pump likely",
      tone: "text-amber",
      style: "bg-amber text-bg",
      note: "Chatter and price are far above normal, and nothing explains them.",
    };
  }
  if (score >= 35) {
    return {
      label: "Watch",
      tone: "text-text",
      style: "border border-amber text-amber",
      note: "Elevated, or explained only in part. Worth a look.",
    };
  }
  return {
    label: "Low risk",
    tone: "text-mute",
    style: "border border-line-strong text-mute",
    note: "Not enough signal to flag.",
  };
}

// Toy weights for illustration only. The real scorer is a trained model and is not built yet.
export const WEIGHTS = { accounts: 0.35, dupes: 0.25, volume: 0.4 } as const;
export const CATALYST_FACTOR = 0.5;

export type Inputs = Record<keyof typeof WEIGHTS, number>;

export function scoreOf(v: Inputs, explained: boolean) {
  const raw = WEIGHTS.accounts * v.accounts + WEIGHTS.dupes * v.dupes + WEIGHTS.volume * v.volume;
  return Math.round(explained ? raw * CATALYST_FACTOR : raw);
}
