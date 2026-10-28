import type { Timeline } from "@/lib/api";

// Score series in plain white, flags as dashed red markers. Text sits in HTML so the SVG can stretch freely.
export function LiveChart({ t }: { t: Timeline }) {
  const from = Date.parse(t.from);
  const span = Date.parse(t.to) - from;
  const x = (iso: string) => (((Date.parse(iso) - from) / span) * 100).toFixed(2);
  const y = (v: number) => (100 - Math.min(100, Math.max(0, v))).toFixed(2);
  const line = t.scores.map((s) => `${x(s.at)},${y(s.score)}`).join(" ");
  const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div>
      <div className="relative h-56 md:h-72">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Score timeline for ${t.ticker}`}>
          {[35, 65].map((v) => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--line-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          ))}
          {t.flags.map((f) => (
            <line key={f.id} x1={x(f.at)} x2={x(f.at)} y1="0" y2="100" stroke="var(--down)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
          {t.scores.length > 1 && (
            <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          )}
        </svg>
        <span className="absolute right-1 font-mono text-[11px] text-mute" style={{ top: `calc(${y(65)}% - 1.1em)` }}>Pump likely 65</span>
        <span className="absolute right-1 font-mono text-[11px] text-mute" style={{ top: `calc(${y(35)}% - 1.1em)` }}>Watch 35</span>
        {t.scores.length < 2 && (
          <p className="absolute inset-0 grid place-items-center text-sm text-mute">Not enough points in this window to draw a line.</p>
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-mute">
        <span>{hm(t.from)}</span>
        <span className="text-down">{t.flags.length > 0 ? `${t.flags.length} FLAG${t.flags.length > 1 ? "S" : ""}` : ""}</span>
        <span>{hm(t.to)}</span>
      </div>
    </div>
  );
}
