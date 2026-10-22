import { RidgeField } from "./ridge-field";
import { REPO_URL, btnGhost, btnPrimary } from "@/lib/ui";

// A server component: the headline and actions are plain HTML that paint immediately.
// Only the ridge canvas behind them is client code.
export function Hero() {
  return (
    <section className="relative isolate min-h-[100dvh] overflow-hidden">
      <RidgeField />
      <div data-hero-copy className="relative mx-auto max-w-[1400px] px-4 pt-24 md:px-8">
        <h1 className="rise max-w-[14ch] text-balance text-[clamp(2.6rem,6.4vw,6rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          See the <span className="text-amber">pump</span> before it dumps.
        </h1>
        <p className="rise mt-6 max-w-[46ch] text-lg leading-relaxed text-mute" style={{ "--d": "120ms" } as React.CSSProperties}>
          Pumpwatch reads social chatter, news and company filings next to live trades, and
          flags tickers moving on hype alone.
        </p>
        <div className="rise mt-7 flex flex-wrap gap-3" style={{ "--d": "200ms" } as React.CSSProperties}>
          <a href={REPO_URL} className={btnPrimary}>
            View on GitHub
          </a>
          <a href="#detector" className={btnGhost}>
            Try the detector
          </a>
        </div>
      </div>
    </section>
  );
}
