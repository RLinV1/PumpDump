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
    <div className="overflow-hidden border border-line bg-line">
      <div className="grid grid-cols-1 gap-px md:grid-cols-12">
        <section className="min-w-0 bg-surface md:col-span-8">
          <header className="flex h-9 items-center justify-between gap-3 border-b border-line px-4 text-xs">
            <h2 className="font-mono text-sm font-semibold">{ticker} risk score</h2>
            <span className="text-mute">{label}, last 6 hours</span>
          </header>
          <div className="p-4">
            <LiveChart t={timeline} />
          </div>
        </section>
        <section className="min-w-0 bg-surface md:col-span-4">
          <header className="flex h-9 items-center justify-between gap-3 border-b border-line px-4 text-xs">
            <h2 className="font-medium">Why {ticker}</h2>
            <span className="text-mute">Evidence, {label.toLowerCase()}</span>
          </header>
          <div className="space-y-4 px-4 py-4">
            {verdict && (
              <div>
                <p className={`text-2xl font-semibold leading-tight tracking-[-0.02em] ${verdict.tone}`}>{verdict.label}.</p>
                <p className="mt-1 text-sm text-mute">Risk score <span className="font-mono text-text">{Math.round(value!)}</span> / 100</p>
                {asOf && <p className="mt-1 text-xs text-mute">Score as of {clock(asOf)} · {age(asOf)}</p>}
              </div>
            )}
            {score && score.staleSources.length > 0 && (
              <p className="text-sm text-mute">Stale inputs: {score.staleSources.join(", ")}. This score may lag.</p>
            )}
            {flag ? (
              <>
                <p className="text-sm text-mute">Flag raised at {clock(flag.raisedAt)} · {age(flag.raisedAt)}, with score {Math.round(flag.evidence.score)}.</p>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-mute">Posts in flagged window</dt><dd className="font-mono">{flag.evidence.postCount}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-mute">Trades in flagged window</dt><dd className="font-mono">{flag.evidence.tradeCount}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-line pt-2">
                    <dt className="text-mute">Catalyst</dt>
                    <dd>{flag.evidence.catalyst === null ? "Not checked" : flag.evidence.catalyst.found ? "Found" : "None found"}</dd>
                  </div>
                </dl>
                {flag.evidence.topContributors.length > 0 && (
                  <p className="break-words text-sm text-mute">Flag contributions: {flag.evidence.topContributors.map((c) => `${c.featureGroup} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)})`).join(", ")}.</p>
                )}
              </>
            ) : <p className="text-sm text-mute">No recent flags. This ticker has not crossed the flag threshold.</p>}
            <p className="break-words font-mono text-[11px] text-mute">Model: {model ?? "Unavailable"}</p>
            <Link href="/live" className="inline-flex min-h-11 items-center text-sm underline decoration-line-strong hover:decoration-text">Open watchlist and all flags</Link>
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-2 text-xs text-mute">
        <p>{flags.length ? `Recent flags: ${flags.map((f) => `${f.ticker} (${Math.round(f.evidence.score)})`).join(", ")}` : "No recent flags."}</p>
        <p>{data.mode === "mock" && <strong className="text-accent">Mock data. No market feed connected. </strong>}{NOTICE}</p>
      </div>
    </div>
  );
}
