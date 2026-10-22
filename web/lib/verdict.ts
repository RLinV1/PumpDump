// Verdicts say how risky a ticker looks, not which way it will move: orange for a likely pump or a watch, never green or red.
export function verdictOf(score: number) {
  if (score >= 65) {
    return {
      label: "Pump likely",
      tone: "text-accent",
      style: "bg-accent text-bg",
      note: "Chatter and price are far above normal, and nothing explains them.",
    };
  }
  if (score >= 35) {
    return {
      label: "Watch",
      tone: "text-text",
      style: "border border-accent text-accent",
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
