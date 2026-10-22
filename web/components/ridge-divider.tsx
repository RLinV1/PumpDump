// A static strip of ridge lines between sections, so the hero's motif carries down the page.
// Server-rendered inline SVG: no JavaScript, no canvas.
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const W = 1000;
const H = 72;
const ROWS = 7;

function line(i: number, seed: number) {
  const base = 14 + i * 8;
  let d = "";
  for (let x = 0; x <= W; x += 8) {
    const u = x / W;
    const win = Math.sin(Math.PI * u) ** 1.4;
    const a = Math.sin(x * 0.022 + i * 1.7 + seed);
    const b = Math.sin(x * 0.051 - i * 2.3 + seed * 2);
    const n = Math.max(0, (a * 0.6 + b * 0.4) / 1.0) ** 1.6;
    const y = base - n * (10 + hash(i + seed) * 12) * win;
    d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
  }
  return d;
}

export function RidgeDivider({ seed = 1, hot = false }: { seed?: number; hot?: boolean }) {
  return (
    <div aria-hidden className="mx-auto max-w-[1400px] px-4 md:px-8">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-14 w-full md:h-[72px]">
        {Array.from({ length: ROWS }, (_, i) => {
          const isHot = hot && i === 4;
          return (
            <path
              key={i}
              d={line(i, seed)}
              fill="var(--bg)"
              stroke={isHot ? "var(--accent)" : "var(--text)"}
              strokeOpacity={isHot ? 1 : 0.12 + i * 0.05}
              strokeWidth={isHot ? 1.6 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
    </div>
  );
}
