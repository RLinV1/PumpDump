// The "/" command palette: pure ranking so it is testable without a browser. Every item runs through parseCommand.
import { MAX_QUESTION, PANELS } from "./commands.ts";

export type PaletteGroup = "tickers" | "commands" | "ask";
export type PaletteItem = { id: string; group: PaletteGroup; label: string; detail?: string; badge?: string; run: string; indexes: number[] };
export type PaletteTicker = { ticker: string; onList: boolean; badge?: string };

export const GROUP_TITLE: Record<PaletteGroup, string> = { tickers: "Tickers", commands: "Commands", ask: "Assistant" };

// Lower score is better: prefix, then word start, then substring, then scattered letters.
export function fuzzy(query: string, text: string): { score: number; indexes: number[] } | null {
  const q = query.trim().toLowerCase(), t = text.toLowerCase();
  if (!q) return { score: 0, indexes: [] };
  const span = (start: number) => Array.from({ length: q.length }, (_, i) => start + i);
  if (t.startsWith(q)) return { score: 0, indexes: span(0) };
  for (let at = t.indexOf(q); at !== -1; at = t.indexOf(q, at + 1)) {
    if (!/[a-z0-9]/.test(t[at - 1] ?? " ")) return { score: 1 + at / 100, indexes: span(at) };
  }
  const at = t.indexOf(q);
  if (at !== -1) return { score: 2 + at / 100, indexes: span(at) };
  const indexes: number[] = [];
  let from = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, from);
    if (i === -1) return null;
    indexes.push(i);
    from = i + 1;
  }
  return { score: 10 + (indexes[indexes.length - 1] - indexes[0]), indexes };
}

type Cmd = { label: string; detail: string; run: string; keywords: string };
const COMMANDS: Cmd[] = [
  ...PANELS.map((p) => ({ label: `Open ${p.title}`, detail: `panel ${p.number}`, run: p.mnemonic, keywords: [p.mnemonic, ...p.aliases].join(" ") })),
  { label: "Go to Paper trading tab", detail: "PT", run: "PT", keywords: "paper trading tab pt" },
  { label: "Open the assistant", detail: "ASK", run: "ASK", keywords: "assistant chat ask ai" },
  { label: "Show data mode (mock or live)", detail: "MODE", run: "MODE", keywords: "mock live data mode" },
  { label: "Refresh all panels", detail: "RF", run: "RF", keywords: "reload refresh rf" },
  { label: "Help: list commands", detail: "HELP", run: "HELP", keywords: "help ?" },
];

const rank = (a: { score: number }, b: { score: number }) => a.score - b.score;

export function paletteItems(query: string, known: PaletteTicker[]): PaletteItem[] {
  const q = query.trim();
  if (!q) return [];
  const symbol = q.replace(/^\$/, "").toUpperCase();
  const isSymbol = /^[A-Z]{1,5}$/.test(symbol);

  const tickers: PaletteItem[] = known.flatMap((k, order) => {
    const m = fuzzy(symbol, k.ticker);
    return m ? [{ score: m.score + order / 1000, item: { id: `t-${k.ticker}`, group: "tickers" as const, label: k.ticker, detail: k.onList ? "watchlist" : "seen today", badge: k.badge, run: `SEL ${k.ticker}`, indexes: m.indexes } }] : [];
  }).sort(rank).slice(0, 5).map((x) => x.item);
  if (isSymbol && tickers.length === 0) {
    tickers.push({ id: `t-${symbol}`, group: "tickers", label: symbol, detail: "select anyway", run: `SEL ${symbol}`, indexes: [...symbol].map((_, i) => i) });
  }

  const commands: PaletteItem[] = COMMANDS.flatMap((c) => {
    const m = fuzzy(q, c.label);
    const hit = m ?? fuzzy(q, c.keywords);
    return hit ? [{ score: hit.score + (m ? 0 : 5), item: { id: `c-${c.run}`, group: "commands" as const, label: c.label, detail: c.detail, run: c.run, indexes: m?.indexes ?? [] } }] : [];
  }).sort(rank).slice(0, 5).map((x) => x.item);
  if (isSymbol) {
    commands.push({ id: `c-look-${symbol}`, group: "commands", label: `Look up ${symbol}`, detail: "panel 7", run: `LOOK ${symbol}`, indexes: [] });
    if (!known.some((k) => k.ticker === symbol && k.onList)) commands.push({ id: `c-add-${symbol}`, group: "commands", label: `Add ${symbol} to watchlist`, detail: "ADD", run: `ADD ${symbol}`, indexes: [] });
  }

  const question = q.replace(/^ask\s+/i, "").trim();
  const ask: PaletteItem[] = question && question.length <= MAX_QUESTION
    ? [{ id: "ask", group: "ask", label: `Ask the assistant: ${question}`, run: `ASK ${question}`, indexes: [] }] : [];
  return [...tickers, ...commands, ...ask];
}
