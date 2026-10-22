import { Market } from "./market";
import { REPO_URL, btnGhost, btnPrimary } from "@/lib/ui";

// A server component: the headline and actions are plain HTML that paint immediately.
// Only the market screen is client code, and it draws after first paint.
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-14">
      <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-10 md:px-8 md:pt-14 [@media(max-height:560px)]:pb-10 [@media(max-height:560px)]:pt-6">
        <h1 className="rise max-w-[16ch] text-balance text-[clamp(2rem,min(5vw,10vh),4.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] md:max-w-none">
          See the <span className="text-amber">pump</span> before it dumps.
        </h1>
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between [@media(max-height:560px)]:mt-3 [@media(max-height:560px)]:gap-3">
          <p className="rise max-w-[50ch] text-pretty text-lg leading-relaxed text-mute [@media(max-height:560px)]:text-base" style={{ "--d": "80ms" } as React.CSSProperties}>
            Pumpwatch reads social chatter, news and company filings next to live trades. It flags
            tickers moving on hype alone and forecasts how far each one may swing.
          </p>
          <div className="rise flex flex-wrap gap-3" style={{ "--d": "140ms" } as React.CSSProperties}>
            <a href={REPO_URL} className={btnPrimary}>
              View on GitHub
            </a>
            <a href="#detector" className={btnGhost}>
              Try the detector
            </a>
          </div>
        </div>
        <div className="mt-10 [@media(max-height:560px)]:mt-5">
          <Market />
        </div>
      </div>
    </section>
  );
}
