"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLookup, type Lookup } from "@/lib/api";
import { btnGhost } from "@/lib/ui";
import { Panel, Skeleton, dirTone, signed } from "@/components/term-panel";

const plain = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? "n/a" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
const cap = (v: number | null) => (v === null ? "n/a" : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const modeLabel = (m: string) => m.toUpperCase();

export type LookupState =
  | { status: "idle" }
  | { status: "loading"; ticker: string }
  | { status: "error"; ticker: string; message: string }
  | { status: "done"; ticker: string; data: Lookup };

// One lookup at a time: asking again cancels the one in flight.
export function useLookup() {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const controller = useRef<AbortController>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const look = useCallback(async (ticker: string) => {
    controller.current?.abort();
    const mineCtl = (controller.current = new AbortController());
    setState({ status: "loading", ticker });
    try {
      const { data } = await getLookup(ticker, mineCtl.signal);
      if (!mineCtl.signal.aborted) setState({ status: "done", ticker, data });
    } catch (error) {
      if (!mineCtl.signal.aborted) setState({ status: "error", ticker, message: error instanceof Error ? error.message : "Lookup failed." });
    }
  }, []);
  return { state, look };
}

export function LookupPanel({ state, onRetry, active }: { state: LookupState; onRetry: (ticker: string) => void; active?: boolean }) {
  const tag = state.status === "done" ? modeLabel(state.data.dataMode) : state.status === "loading" ? "LOADING" : undefined;
  return (
    <Panel id="lookup" number={7} title="Stock lookup" tag={tag} active={active} className="lg:col-start-3 lg:row-start-2">
      {state.status === "idle" ? (
        <div className="p-3 text-xs" role="status">
          <p className="font-semibold text-accent">Look up one stock</p>
          <p className="mt-1 max-w-[52ch] text-mute">Snapshot, performance, indicators and risk for any ticker.</p>
          <p className="mt-2 text-yellow">LOOK GME &lt;GO&gt; <span className="text-mute">or</span> DES AAPL &lt;GO&gt;</p>
        </div>
      ) : state.status === "loading" ? (
        <Skeleton rows={4} />
      ) : state.status === "error" ? (
        <div className="p-3 text-xs" role="alert">
          <p className="font-semibold text-accent">No lookup for {state.ticker}.</p>
          <p className="mt-1 max-w-[52ch] text-mute">{state.message}</p>
          <button type="button" onClick={() => onRetry(state.ticker)} className={`${btnGhost} mt-2`}>Retry</button>
        </div>
      ) : (
        <LookupBody d={state.data} />
      )}
    </Panel>
  );
}

function Row({ k, v, tone = "text-white" }: { k: string; v: string; tone?: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-accent">{k}</dt><dd className={`tabular-nums ${tone}`}>{v}</dd></div>;
}

function LookupBody({ d }: { d: Lookup }) {
  const i = d.indicators;
  return (
    <div className="text-xs">
      <p className="border-b border-line px-2 py-1">
        <span className="font-semibold text-yellow">{d.ticker}</span> <span className="text-white">{d.name}</span> <span className="text-mute">{d.sector}</span>
      </p>
      <div className="grid gap-x-4 gap-y-0.5 px-2 py-1.5 sm:grid-cols-2">
        <dl className="space-y-0.5">
          <Row k="PRICE" v={`$${plain(d.price)}`} />
          <Row k="DAY" v={signed(d.changePct)} tone={dirTone(d.changePct)} />
          <Row k="MKT CAP" v={cap(d.marketCap)} />
          <Row k="P/E" v={plain(d.peRatio, 1)} />
          {Object.entries(d.performance).map(([k, v]) => <Row key={k} k={k.toUpperCase()} v={v === null ? "n/a" : signed(v)} tone={v === null ? "text-mute" : dirTone(v)} />)}
        </dl>
        <dl className="space-y-0.5">
          <Row k="SMA 50" v={plain(i.sma50)} />
          <Row k="SMA 200" v={plain(i.sma200)} />
          <Row k="TREND" v={i.trend ? `${i.trend} 200D` : "n/a"} />
          <Row k="RSI 14" v={plain(i.rsi, 1)} />
          <Row k="52W LOW" v={plain(i.low52w)} />
          <Row k="52W HIGH" v={plain(i.high52w)} />
          <Row k={`BETA ${d.risk.benchmark}`} v={plain(d.risk.beta)} />
          <Row k="VOL (YR)" v={d.risk.volatilityPct === null ? "n/a" : `${plain(d.risk.volatilityPct, 1)}%`} />
        </dl>
      </div>
      <p className="border-t border-line px-2 py-1 text-mute">Moves {d.risk.movement}; {d.risk.sensitivity}. Educational, not investment advice.</p>
    </div>
  );
}
