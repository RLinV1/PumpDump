import { Market } from "./market";
import { LandingMarket } from "./landing-market";
import { REPO_URL, btnGhost, btnPrimary } from "@/lib/ui";

// A server component: the headline and actions are plain HTML that paint immediately.
// Only the market screen is client code, and it draws after first paint.
// The split is deliberately uneven (7 to 5): the headline gets the wide side, the terminal panel the narrow one.
export function Hero() {
  return (
    <section className="border-b border-accent pt-12">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 pb-10 pt-8 md:px-8 lg:grid-cols-[7fr_5fr] lg:gap-10 lg:pb-12 lg:pt-10">
        <div className="flex flex-col justify-center gap-10">
          <h1 className="rise font-display text-[clamp(3.4rem,min(7.4vw,14vh),8.5rem)] font-black uppercase leading-[0.84] tracking-[0.002em] text-accent">
            See the <span className="text-up">pump</span>
            <br />
            before it <span className="text-down">dumps</span>.
          </h1>
          <div className="rise max-w-[58ch]" style={{ "--d": "80ms" } as React.CSSProperties}>
            <p className="text-pretty text-[15px] leading-relaxed text-text">
              Pumpwatch reads social chatter, news and company filings next to live trades. It flags
              tickers moving on hype alone and shows the evidence behind each signal.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#detector" className={btnPrimary}>
                Try the detector &lt;GO&gt;
              </a>
              <a href="/live" className={btnGhost}>
                Open the terminal
              </a>
              <a href={REPO_URL} className={btnGhost}>
                GitHub
              </a>
            </div>
          </div>
        </div>
        <div className="min-w-0 lg:pt-1">
          <LandingMarket><Market /></LandingMarket>
        </div>
      </div>
    </section>
  );
}
