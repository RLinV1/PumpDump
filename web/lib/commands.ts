// The terminal command line. Pure, so the grammar is testable without a browser.
export type Panel = "watchlist" | "chart" | "flags" | "news" | "sentiment" | "movers" | "lookup";

export type Command =
  | { type: "empty" }
  | { type: "panel"; panel: Panel }
  | { type: "paper" }
  | { type: "assistant" }
  | { type: "mode" }
  | { type: "select"; ticker: string }
  | { type: "add"; ticker: string }
  | { type: "remove"; ticker: string }
  | { type: "look"; ticker: string }
  | { type: "ask"; question: string }
  | { type: "trade"; side: "BUY" | "SELL"; ticker: string; qty: number }
  | { type: "reset"; confirmed: boolean }
  | { type: "help" }
  | { type: "refresh" }
  | { type: "error"; message: string };

// Panel numbers are shown in each panel's title bar, so typing the number jumps there. Paper trading is the /paper tab and the assistant is a chat widget, not panels.
export const PANELS: { id: Panel; number: number; mnemonic: string; title: string; aliases: string[] }[] = [
  { id: "watchlist", number: 1, mnemonic: "WL", title: "Watchlist", aliases: ["WATCH", "WATCHLIST"] },
  { id: "chart", number: 2, mnemonic: "GR", title: "Score chart", aliases: ["CHART", "SCORE"] },
  { id: "flags", number: 3, mnemonic: "FLAG", title: "Flags", aliases: ["FLAGS", "ALRT"] },
  { id: "news", number: 4, mnemonic: "NEWS", title: "News", aliases: [] },
  { id: "sentiment", number: 5, mnemonic: "SENT", title: "Sentiment", aliases: ["SENTIMENT"] },
  { id: "movers", number: 6, mnemonic: "MOV", title: "Movers", aliases: ["MOVERS"] },
  { id: "lookup", number: 7, mnemonic: "LOOK", title: "Stock lookup", aliases: ["DES", "LOOKUP"] },
];

export const MAX_QTY = 10_000;

const TICKER = /^[A-Z]{1,5}$/;

export const MAX_QUESTION = 300;

export function parseCommand(input: string): Command {
  // ASK keeps the question's own case: the assistant reads "GME" and "Apple" differently.
  const ask = /^ask\s+([\s\S]+)$/i.exec(input.trim());
  if (ask) {
    const question = ask[1].replace(/\s*<GO>\s*$/i, "").replace(/\s+/g, " ").trim();
    if (!question || /^go$/i.test(question)) return { type: "assistant" }; // "ASK <GO>" opens the chat widget
    if (question.length > MAX_QUESTION) return { type: "error", message: `QUESTIONS ARE LIMITED TO ${MAX_QUESTION} CHARACTERS.` };
    return { type: "ask", question };
  }
  // "GME <GO>" and "GME GO" mean the same as "GME".
  const text = input.trim().toUpperCase().replace(/\s*<?\bGO\b>?$/, "").replace(/\s+/g, " ").replace(/^\$/, "");
  if (!text) return { type: "empty" };

  const byNumber = PANELS.find((p) => String(p.number) === text);
  if (byNumber) return { type: "panel", panel: byNumber.id };
  const byName = PANELS.find((p) => p.mnemonic === text || p.aliases.includes(text));
  if (byName) return { type: "panel", panel: byName.id };
  if (text === "ASK" || text === "AI" || text === "ASSISTANT") return { type: "assistant" };
  if (text === "PT" || text === "PAPER") return { type: "paper" };
  if (text === "MODE") return { type: "mode" };
  if (text === "HELP" || text === "?") return { type: "help" };
  if (text === "RF" || text === "REFRESH") return { type: "refresh" };

  if (text === "PT RESET") return { type: "reset", confirmed: false };
  if (text === "PT RESET CONFIRM") return { type: "reset", confirmed: true };
  if (/^PT /.test(text)) return { type: "error", message: "USAGE: PT, PT RESET, THEN PT RESET CONFIRM." };

  // BUY and SELL always mean an order, so a ticker of that name is reached with SEL.
  const trade = /^(BUY|SELL)(?: (.*))?$/.exec(text);
  if (trade) {
    const [ticker, qty, ...rest] = (trade[2] ?? "").split(" ");
    const usage = `USAGE: ${trade[1]} <TICKER> <QTY>, E.G. ${trade[1]} GME 10. QTY IS A WHOLE NUMBER FROM 1 TO ${MAX_QTY.toLocaleString("en-US")}.`;
    const symbol = (ticker ?? "").replace(/^\$/, "");
    if (!TICKER.test(symbol) || rest.length || !/^\d{1,5}$/.test(qty ?? "")) return { type: "error", message: usage };
    const n = Number(qty);
    if (n < 1 || n > MAX_QTY) return { type: "error", message: usage };
    return { type: "trade", side: trade[1] as "BUY" | "SELL", ticker: symbol, qty: n };
  }

  const verb = /^(ADD|RM|SEL|LOOK|DES) (.*)$/.exec(text);
  if (verb) {
    const ticker = verb[2].replace(/^\$/, "");
    if (!TICKER.test(ticker)) return { type: "error", message: `USAGE: ${verb[1]} <TICKER>, A TICKER IS 1 TO 5 LETTERS.` };
    const type = verb[1] === "ADD" ? "add" : verb[1] === "RM" ? "remove" : verb[1] === "SEL" ? "select" : "look";
    return { type, ticker };
  }
  if (TICKER.test(text)) return { type: "select", ticker: text };
  const shown = text.length > 24 ? `${text.slice(0, 24)}...` : text;
  return { type: "error", message: `UNKNOWN COMMAND "${shown}". TYPE HELP <GO> FOR THE LIST.` };
}
