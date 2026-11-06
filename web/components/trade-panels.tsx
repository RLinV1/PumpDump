"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLookup, getPaperAccount, placePaperOrder, resetPaperAccount, type Lookup, type PaperAccount } from "@/lib/api";
import { btnGhost } from "@/lib/ui";
import { Panel, Skeleton, dirTone, signed } from "@/components/term-panel";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const signedUsd = (cents: number) => `${cents > 0 ? "+" : ""}${usd(cents)}`;
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

export type PaperState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; account: PaperAccount };

export type PaperResult = { ok: boolean; text: string };

export function usePaper() {
  const [state, setState] = useState<PaperState>({ status: "loading" });
  const [confirmReset, setConfirmReset] = useState(false);
  const busy = useRef(false); // a double submit is dropped here and made safe again on the server
  const refresh = useCallback(async () => {
    try {
      const { data } = await getPaperAccount();
      setState({ status: "done", account: data });
    } catch (error) {
      setState((old) => (old.status === "done" ? old : { status: "error", message: error instanceof Error ? error.message : "Paper account unavailable." }));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const trade = useCallback(async (side: "BUY" | "SELL", ticker: string, qty: number): Promise<PaperResult> => {
    if (busy.current) return { ok: false, text: "AN ORDER IS ALREADY IN FLIGHT." };
    busy.current = true;
    try {
      const { data } = await placePaperOrder(side, ticker, qty);
      setState({ status: "done", account: data });
      const f = data.fill;
      return { ok: true, text: f ? `PAPER ${f.side} ${f.qty} ${f.ticker} @ ${usd(f.priceCents)} (${modeLabel(data.dataMode)}). SIMULATED.` : "ORDER FILLED. SIMULATED." };
    } catch (error) {
      return { ok: false, text: (error instanceof Error ? error.message : "Order failed.").toUpperCase() };
    } finally { busy.current = false; }
  }, []);
  const reset = useCallback(async (): Promise<PaperResult> => {
    setConfirmReset(false);
    try {
      const { data } = await resetPaperAccount();
      setState({ status: "done", account: data });
      return { ok: true, text: "PAPER ACCOUNT RESET TO THE STARTING CASH." };
    } catch (error) {
      return { ok: false, text: (error instanceof Error ? error.message : "Reset failed.").toUpperCase() };
    }
  }, []);
  return { state, refresh, trade, reset, confirmReset, askReset: () => setConfirmReset(true), cancelReset: () => setConfirmReset(false) };
}

export function PaperPanel({ paper, onConfirmReset, active }: { paper: ReturnType<typeof usePaper>; onConfirmReset: () => void; active?: boolean }) {
  const { state } = paper;
  const tag = <><span className="mr-2 border border-yellow px-1 text-yellow">PAPER</span>{state.status === "done" ? modeLabel(state.account.dataMode) : ""}</>;
  return (
    <Panel id="paper" number={8} title="Paper trading" tag={tag} active={active} className="lg:col-start-3 lg:row-start-3">
      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <div className="p-3 text-xs" role="alert">
          <p className="font-semibold text-accent">Paper account unavailable.</p>
          <p className="mt-1 max-w-[52ch] text-mute">{state.message}</p>
          <button type="button" onClick={() => void paper.refresh()} className={`${btnGhost} mt-2`}>Retry</button>
        </div>
      ) : (
        <div className="text-xs">
          <dl className="grid grid-cols-3 gap-x-3 border-b border-line px-2 py-1.5">
            <div><dt className="text-accent">CASH</dt><dd className="tabular-nums text-white">{usd(state.account.cashCents)}</dd></div>
            <div><dt className="text-accent">TOTAL</dt><dd className="tabular-nums text-white">{usd(state.account.totalCents)}</dd></div>
            <div><dt className="text-accent">P&amp;L</dt><dd className={`tabular-nums ${dirTone(state.account.pnlCents)}`}>{signedUsd(state.account.pnlCents)}</dd></div>
          </dl>
          {state.account.positions.length === 0 ? (
            <p className="px-2 py-2 text-mute">No positions. <span className="text-yellow">BUY GME 10 &lt;GO&gt;</span> places a simulated order.</p>
          ) : (
            <table className="w-full tabular-nums">
              <caption className="sr-only">Paper positions</caption>
              <thead><tr className="text-left text-accent"><th className="px-2 font-normal">POS</th><th className="font-normal">QTY</th><th className="font-normal">AVG</th><th className="font-normal">MARK</th><th className="px-2 text-right font-normal">P&amp;L</th></tr></thead>
              <tbody>
                {state.account.positions.map((p) => (
                  <tr key={p.ticker}>
                    <td className="px-2 font-semibold text-yellow">{p.ticker}</td><td className="text-white">{p.qty}</td><td className="text-white">{usd(p.avgCostCents)}</td>
                    <td className="text-white">{p.markCents === null ? "n/a" : usd(p.markCents)}</td>
                    <td className={`px-2 text-right ${p.pnlCents === null ? "text-mute" : dirTone(p.pnlCents)}`}>{p.pnlCents === null ? "n/a" : signedUsd(p.pnlCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {state.account.orders.length > 0 && (
            <div className="border-t border-line px-2 py-1">
              <p className="text-accent">ORDERS</p>
              <ul>
                {state.account.orders.slice(0, 8).map((o) => (
                  <li key={o.id} className="tabular-nums text-white"><span className={o.side === "BUY" ? "text-up" : "text-down"}>{o.side}</span> {o.qty} {o.ticker} @ {usd(o.priceCents)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5 text-mute">
            {paper.confirmReset ? (
              <>
                <span className="text-yellow">Reset to {usd(state.account.startCents)} and clear history?</span>
                <button type="button" onClick={onConfirmReset} className={btnGhost}>Confirm reset</button>
                <button type="button" onClick={paper.cancelReset} className={btnGhost}>Cancel</button>
              </>
            ) : (
              <span>Simulated only: no broker, no real orders. PT RESET starts over. Not investment advice.</span>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
