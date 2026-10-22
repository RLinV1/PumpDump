// One illustrative pump, defined once so every lane, label and caption lines up on the same time axis.
// t runs from 0 to 1. All values are 0..1. Nothing here is market data.
const N = 160;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const bump = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));

type Fn = (t: number) => number;

// chatterAmp and priceAmp shrink the move; factor is the catalyst discount applied to the score.
export function makeSeries(chatterAmp = 1, priceAmp = 1, factor = 1) {
  const chatter: Fn = (t) =>
    clamp(0.07 + 0.93 * chatterAmp * bump(t, 0.4, 0.12) + 0.025 * Math.sin(t * 41) + 0.015 * Math.sin(t * 83));

  const price: Fn = (t) => {
    const w = t < 0.56 ? 0.1 : 0.17;
    return clamp(0.14 + 0.66 * priceAmp * bump(t, 0.56, w) + 0.012 * Math.sin(t * 33));
  };

  // The score needs chatter and price high at the same time. A short moving average makes it confirm after
  // price moves instead of jumping with it, and a catalyst discounts it.
  const raw: Fn = (t) => clamp(3.8 * (chatter(t) - 0.1) * (price(t) - 0.12));
  const score: Fn = (t) => {
    let sum = 0;
    const steps = 14;
    for (let i = 0; i < steps; i++) sum += raw(Math.max(0, t - (i / steps) * 0.14));
    return clamp((1.5 * factor * sum) / steps);
  };

  return { chatter, price, score };
}

// The hype-only case, used by the scroll story.
export const { chatter, price, score } = makeSeries();
// The same ticker with a filing that explains the move: calmer chatter, a smaller price move, a discounted score.
export const explained = makeSeries(0.5, 0.45, 0.5);

const firstAbove = (fn: Fn, level: number) => {
  for (let i = 0; i <= N; i++) if (fn(i / N) >= level) return i / N;
  return 1;
};

export const FLAG_LEVEL = 0.72;
export const tChatter = firstAbove(chatter, 0.35);
export const tPrice = firstAbove(price, 0.32);
export const tFlag = firstAbove(score, FLAG_LEVEL);
export const tChatterPeak = 0.4;
export const tPricePeak = 0.56;
export const tFiling = 0.2;

// SVG path for a series in a W x H box with vertical padding. Used with preserveAspectRatio="none".
export function path(fn: Fn, W = 1000, H = 100, pad = 8) {
  let d = "";
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (t * W).toFixed(1);
    const y = (H - pad - fn(t) * (H - pad * 2)).toFixed(1);
    d += `${i === 0 ? "M" : "L"}${x} ${y}`;
  }
  return d;
}

export function area(fn: Fn, W = 1000, H = 100, pad = 8) {
  return `${path(fn, W, H, pad)}L${W} ${H}L0 ${H}Z`;
}
