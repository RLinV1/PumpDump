// An invented market that replays one pump forever. It is deterministic (seeded), so the server and the
// client render the same first frame. Nothing here is market data.
export type Candle = {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  chatter: number; // multiple of the ticker's normal chatter
  score: number; // 0..100
  newShare: number; // share of posts from accounts under 30 days old
  dupeShare: number; // share of near-duplicate posts
  flag: boolean; // the candle on which the flag fires
  swing: number; // expected one-hour price swing, in percent (stand-in for the volatility model's output)
};

export const swingRegime = (s: number) => (s < 6 ? "Calm" : s < 15 ? "Elevated" : "Extreme");

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A short loop, so the screen never sits quiet for long: a brief calm, then chatter climbs, price follows with
// volume, the flag fires, the price peaks and falls back.
const LENGTH = 110;
export const FLAG_SCORE = 72;

function build(startPrice: number, seed: number): Candle[] {
  const r = rng(seed);
  const out: Candle[] = [];
  let prev = startPrice;
  const recent: number[] = [];
  let flagged = false;
  const rets: number[] = [];

  for (let i = 0; i < LENGTH; i++) {
    const mult = 1 + 0.85 * smooth(52, 70, i) - 0.8 * smooth(74, 96, i);
    const ramp = smooth(34, 58, i);
    const chatter = 1 + 13 * ramp * (1 - smooth(74, 96, i)) + (r() - 0.5) * (0.4 + 0.6 * ramp);
    const noise = (r() - 0.5) * 0.014;
    const c = startPrice * mult * (1 + noise);
    const o = prev;
    const wick = Math.abs(r() - 0.5) * 0.012 + 0.002;
    const h = Math.max(o, c) * (1 + wick);
    const l = Math.min(o, c) * (1 - wick);
    const move = Math.abs(c - o) / startPrice;
    const v = (1 + r() * 0.6 + move * 260 * smooth(46, 66, i)) * (1 - 0.5 * smooth(88, 104, i));

    const cn = clamp((chatter - 1) / 12);
    const pn = clamp((c / startPrice - 1) / 0.6);
    // Chatter leads, price confirms: the flag fires early in the move, not after it.
    recent.push(clamp(0.55 * cn * cn + 0.5 * pn));
    if (recent.length > 6) recent.shift();
    const score = Math.round(100 * (recent.reduce((a, b) => a + b, 0) / recent.length));

    const flag = !flagged && score >= FLAG_SCORE;
    if (flag) flagged = true;
    rets.push(c / o - 1);
    if (rets.length > 20) rets.shift();
    const swing = 100 * Math.sqrt(rets.reduce((a, b) => a + b * b, 0) / rets.length) * Math.sqrt(60);

    out.push({
      swing,
      o,
      h,
      l,
      c,
      v,
      chatter,
      score,
      newShare: clamp(0.1 + 0.62 * cn, 0, 0.8),
      dupeShare: clamp(0.04 + 0.55 * cn * cn, 0, 0.7),
      flag,
    });
    prev = c;
  }
  return out;
}

// Streams candles one at a time and lets the newest one form tick by tick.
export class Stream {
  history: Candle[] = [];
  target!: Candle;
  private queue: Candle[] = [];
  private seed: number;
  private base: number;

  constructor(seed = 7, base = 3.2, preload = 48) {
    this.seed = seed;
    this.base = base;
    this.queue = build(base, seed);
    this.next();
    for (let i = 0; i < preload; i++) this.commit();
  }

  private next() {
    if (this.queue.length < 2) {
      const last = this.history.length ? this.history[this.history.length - 1].c : this.base;
      this.queue.push(...build(last, ++this.seed));
    }
    this.target = this.queue.shift()!;
  }

  commit() {
    this.history.push(this.target);
    if (this.history.length > 220) this.history.shift();
    this.next();
  }

  // The forming candle at progress t (0..1): it opens at the previous close and moves toward its final shape.
  partial(t: number, wiggle: number): Candle {
    const tg = this.target;
    const c = tg.o + (tg.c - tg.o) * t + wiggle * (1 - t) * tg.o * 0.004;
    const hi = Math.max(tg.o, c) + (tg.h - Math.max(tg.o, tg.c)) * t;
    const lo = Math.min(tg.o, c) - (Math.min(tg.o, tg.c) - tg.l) * t;
    return { ...tg, c, h: hi, l: lo, v: tg.v * t };
  }
}
