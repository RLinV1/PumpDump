// Deterministic little traces that show each feed's character. Plain strings, so they render on the server.
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const W = 240;
const H = 56;

// Many small posts with occasional bursts.
function posts(seed: number) {
  let d = "";
  for (let x = 0; x <= W; x += 3) {
    const h = hash(x + seed * 101);
    const y = H - 6 - (h > 0.86 ? h * 38 : h * 7);
    d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
  }
  return d;
}

// A price walk that moves in small steps.
function trades(seed: number) {
  let y = H / 2;
  let d = `M0 ${y}`;
  for (let x = 6; x <= W; x += 6) {
    y = Math.min(H - 6, Math.max(6, y + (hash(x + seed * 53) - 0.5) * 12));
    d += `L${x} ${y.toFixed(1)}`;
  }
  return d;
}

// A flat line with a few headlines.
function news(seed: number) {
  let d = `M0 ${H - 10}L${W} ${H - 10}`;
  for (let i = 0; i < 6; i++) {
    const x = Math.round(hash(i + seed * 17) * (W - 12)) + 6;
    const h = 8 + hash(i * 3 + seed) * 14;
    d += `M${x} ${H - 10}L${x} ${(H - 10 - h).toFixed(1)}`;
  }
  return d;
}

// A flat line with a rare, tall filing.
function filings(seed: number) {
  let d = `M0 ${H - 10}L${W} ${H - 10}`;
  for (let i = 0; i < 2; i++) {
    const x = Math.round(hash(i + seed * 29) * (W - 40)) + 20;
    d += `M${x} ${H - 10}L${x} 8`;
  }
  return d;
}

export const TRACES = { posts, trades, news, filings };
export const TRACE_BOX = { W, H };
