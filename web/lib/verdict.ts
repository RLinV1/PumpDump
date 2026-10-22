// Verdicts use amber only. Green and red are reserved for price direction, so a risk label never reads as buy or sell.
export function verdictOf(score: number) {
  if (score >= 65) return { label: "Pump likely", style: "bg-amber text-bg" };
  if (score >= 35) return { label: "Watch", style: "border border-amber text-amber" };
  return { label: "Low risk", style: "border border-line-strong text-mute" };
}

// Toy weights for illustration only. The real scorer is a trained model and is not built yet.
export const WEIGHTS = { accounts: 0.35, dupes: 0.25, volume: 0.4 } as const;
export const CATALYST_FACTOR = 0.5;

export type Inputs = Record<keyof typeof WEIGHTS, number>;

export function scoreOf(v: Inputs, explained: boolean) {
  const raw = WEIGHTS.accounts * v.accounts + WEIGHTS.dupes * v.dupes + WEIGHTS.volume * v.volume;
  return Math.round(explained ? raw * CATALYST_FACTOR : raw);
}
