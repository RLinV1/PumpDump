import Link from "next/link";
import { LiveChart } from "./live-chart";
import { NOTICE, age, clock, type LandingData } from "@/lib/api";
import { verdictOf } from "@/lib/verdict";

// Every number in this panel comes from the live API. Missing evidence stays explicitly missing.
export default function LiveMarket({ data }: { data: LandingData }) {
  const { ticker, score, flags, timeline } = data;
  const label = data.mode === "mock" ? "Mock" : "Live";
  const flag = flags.find((f) => f.ticker === ticker);
  const latest = timeline.scores.at(-1);
  const value = latest?.score ?? score?.score ?? flag?.evidence.score;
  const verdict = value === undefined ? null : verdictOf(value);
  const model = latest?.modelVersion ?? score?.modelVersion ?? flag?.evidence.modelVersion;
  const asOf = latest?.at ?? score?.windowEnd ?? flag?.raisedAt;

  return (
    <div className="overflow-hidden border border-line-strong bg-line">
      <div className="grid grid-cols-1 gap-px">
        <section className="min-w-0 bg-surface">
          <header className="bar flex h-8 items-center justify-between gap-3 px-3 text-xs">
            <h2 className="font-mono font-semibold"><span className="text-yellow">{ticker}</span> RISK SCORE</h2>
            <span className="text-xs uppercase">{label}, last 6 hours</span>
          </header>
          <div className="p-3">
            <LiveChart t={timeline} />
          </div>
        </section>
        <section className="min-w-0 bg-surface">
          <header className="bar flex h-8 items-center justify-between gap-3 px-3 text-xs">
            <h2 className="font-semibold">WHY <span className="text-yellow">{ticker}</span></h2>
            <span className="text-xs uppercase">Evidence, {label.toLowerCase()}</span>
          </header>
          <div className="space-y-3 px-3 py-3 text-xs">
            {verdict && (
              <div>
                <p className={`font-display text-3xl font-extrabold uppercase leading-none ${verdict.tone}`}>{verdict.label}.</p>
                <p className="mt-1 text-mute">Risk score <span className="text-white">{Math.round(value!)}</span> / 100</p>
                {asOf && <p className="mt-1 text-mute">Score as of {clock(asOf)}, {age(asOf)}</p>}
              </div>
            )}
            <div>
              <p className="text-accent">Expected swing, next hour</p>
              {score?.swing ? (
                <>
                  <p className="mt-1 text-white">
                    Expected range next hour: about {score.swing.median.toFixed(1)}%, up to {score.swing.upperBand.toFixed(1)}% (high to low).{" "}
                    <span className="uppercase text-yellow">{score.swing.regime}</span> for this ticker.
                  </p>
                  {data.mode === "mock" && <p className="text-mute">Mock forecast, not a model output.</p>}
                </>
              ) : <p className="mt-1 text-mute">No forecast yet.</p>}
              <p className="mt-1 text-mute">Size of move, not direction. Not investment advice.</p>
            </div>
            {score && score.staleSources.length > 0 && (
              <p className="text-mute">Stale inputs: {score.staleSources.join(", ")}. This score may lag.</p>
            )}
            {flag ? (
              <>
                <p className="text-mute">Flag raised at {clock(flag.raisedAt)}, {age(flag.raisedAt)}, with score {Math.round(flag.evidence.score)}.</p>
                <dl className="grid gap-1">
                  <div className="flex justify-between gap-3"><dt className="text-accent">Posts in flagged window</dt><dd>{flag.evidence.postCount}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-accent">Trades in flagged window</dt><dd>{flag.evidence.tradeCount}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-line pt-1">
                    <dt className="text-accent">Catalyst</dt>
                    <dd>{flag.evidence.catalyst === null ? "Not checked" : flag.evidence.catalyst.found ? "Found" : "None found"}</dd>
                  </div>
                </dl>
                {flag.evidence.topContributors.length > 0 && (
                  <p className="break-words text-mute">Flag contributions: {flag.evidence.topContributors.map((c) => `${c.featureGroup} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)})`).join(", ")}.</p>
                )}
              </>
            ) : <p className="text-mute">No recent flags. This ticker has not crossed the flag threshold.</p>}
            <p className="break-words text-xs text-mute">Model: {model ?? "Unavailable"}</p>
            <Link href="/live" className="inline-flex min-h-11 items-center text-cyan underline">Open the terminal</Link>
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 text-xs text-mute">
        <p>{flags.length ? `Recent flags: ${flags.map((f) => `${f.ticker} (${Math.round(f.evidence.score)})`).join(", ")}` : "No recent flags."}</p>
        <p>{data.mode === "mock" && <strong className="text-accent">MOCK DATA. No market feed connected. </strong>}{NOTICE}</p>
      </div>
    </div>
  );
}
