"use client";

import Link from "next/link";
import { useState } from "react";
import { NOTICE } from "@/lib/api";
import { MAX_QTY } from "@/lib/commands";
import { btnGhost } from "@/lib/ui";
import { AppTabs } from "@/components/app-tabs";
import { PaperPanel, usePaper, type PaperResult } from "@/components/trade-panels";

// Paper trading on its own tab. The anonymous account token is the same one the terminal's BUY and SELL commands use.
export function PaperView() {
  const paper = usePaper();
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("1");
  const [result, setResult] = useState<PaperResult>();
  const mode = paper.state.status === "done" ? paper.state.account.dataMode : undefined;

  const symbol = ticker.trim().replace(/^\$/, "").toUpperCase();
  const valid = /^[A-Z]{1,5}$/.test(symbol) && /^\d{1,5}$/.test(qty) && Number(qty) >= 1 && Number(qty) <= MAX_QTY;
  const order = async (side: "BUY" | "SELL") => {
    if (!valid) return;
    setResult(undefined);
    setResult(await paper.trade(side, symbol, Number(qty)));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-accent bg-bg px-3 py-1 lg:static lg:h-12 lg:flex-nowrap lg:py-0">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center font-display text-3xl font-black uppercase leading-none tracking-wide text-accent">Pumpwatch</Link>
        <AppTabs current="/paper" />
        <p className="ml-auto text-xs"><span className="mr-2 border border-yellow px-1 text-yellow">PAPER</span><span className="text-white">Paper money, not real.</span></p>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-px p-px">
        <form aria-label="Place a paper order" className="border border-line-strong p-3" onSubmit={(event) => event.preventDefault()}>
          <p className="mb-2 text-xs text-accent">SIMULATED ORDER <span className="text-mute">Whole shares, filled at the server&apos;s price. No broker, no real money.</span></p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="paper-ticker" className="mb-1 block text-xs text-accent">Stock ticker</label>
              <input id="paper-ticker" value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="e.g. GME" maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="h-11 w-28 border border-line-strong bg-bg px-2 text-base uppercase text-white placeholder:normal-case placeholder:text-mute lg:h-9 lg:text-xs" />
            </div>
            <div>
              <label htmlFor="paper-qty" className="mb-1 block text-xs text-accent">Shares</label>
              <input id="paper-qty" value={qty} onChange={(event) => setQty(event.target.value)} inputMode="numeric" maxLength={5} autoComplete="off" className="h-11 w-24 border border-line-strong bg-bg px-2 text-base tabular-nums text-white lg:h-9 lg:text-xs" />
            </div>
            <button type="button" disabled={!valid} onClick={() => void order("BUY")} className={`${btnGhost} disabled:border-line-strong disabled:text-mute disabled:hover:bg-bg disabled:hover:text-mute lg:h-9`}>Buy</button>
            <button type="button" disabled={!valid} onClick={() => void order("SELL")} className={`${btnGhost} disabled:border-line-strong disabled:text-mute disabled:hover:bg-bg disabled:hover:text-mute lg:h-9`}>Sell</button>
            <button type="button" onClick={paper.askReset} className="inline-flex h-11 items-center px-3 text-xs uppercase text-mute underline hover:text-white lg:h-9">Reset account</button>
          </div>
          <p className="mt-2 min-h-4 text-xs" role="status">{result ? <span className={result.ok ? "text-white" : "text-yellow"}>{result.ok ? "OK" : "ERR:"} {result.text}</span> : <span className="text-mute">Shares are a whole number from 1 to {MAX_QTY.toLocaleString("en-US")}.</span>}</p>
        </form>
        <PaperPanel paper={paper} onConfirmReset={() => void paper.reset().then(setResult)} />
      </main>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-accent px-3 py-1 text-xs">
        <span className="text-accent">DATA <strong className={mode === "mock" ? "bg-accent px-1 text-bg" : "text-white"}>{mode ? mode.toUpperCase() : "--"}</strong></span>
        <span className="min-w-0 text-mute lg:ml-auto">{NOTICE}</span>
      </footer>
    </div>
  );
}
