import type { Timeline } from "@/lib/api";

// Score series in plain white, flags as dashed yellow markers (red is for price direction only).
// Text sits in HTML so the SVG can stretch freely.
export function LiveChart({ t, tall = false }: { t: Timeline; tall?: boolean }) {
  const from = Date.parse(t.from);
  const span = Date.parse(t.to) - from;
  const x = (iso: string) => (((Date.parse(iso) - from) / span) * 100).toFixed(2);
  const y = (v: number) => (100 - Math.min(100, Math.max(0, v))).toFixed(2);
  const line = t.scores.map((s) => `${x(s.at)},${y(s.score)}`).join(" ");
  const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className={tall ? "flex h-full min-h-24 flex-col" : undefined}>
      <div className={`relative ${tall ? "min-h-20 flex-1" : "h-48 md:h-60"}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Score timeline for ${t.ticker}`}>
          {[0, 25, 50, 75, 100].map((v) => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          {[35, 65].map((v) => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--accent)" strokeOpacity="0.7" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          {t.flags.map((f) => (
            <line key={f.id} x1={x(f.at)} x2={x(f.at)} y1="0" y2="100" stroke="var(--yellow)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
          {t.scores.length > 1 && (
            <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" />
          )}
        </svg>
        <span className="absolute right-1 font-mono text-xs text-accent" style={{ top: `calc(${y(65)}% - 1.2em)` }}>PUMP LIKELY 65</span>
        <span className="absolute right-1 font-mono text-xs text-accent" style={{ top: `calc(${y(35)}% - 1.2em)` }}>WATCH 35</span>
        {t.scores.length < 2 && (
          <p className="absolute inset-0 grid place-items-center bg-black/80 text-sm text-mute">Not enough points in this window to draw a line.</p>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs text-mute">
        <span>{hm(t.from)}</span>
        <span className="text-yellow">{t.flags.length > 0 ? `${t.flags.length} FLAG${t.flags.length > 1 ? "S" : ""}` : ""}</span>
        <span>{hm(t.to)}</span>
      </div>
    </div>
  );
}
