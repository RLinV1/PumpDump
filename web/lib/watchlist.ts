const KEY = "pumpwatch:watchlist";

export function parseWatchlist(raw: string | null): string[] | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value) || value.length > 30 || !value.every((ticker) => typeof ticker === "string" && /^[A-Z]{1,5}$/.test(ticker))) return null;
    return [...new Set(value)];
  } catch { return null; }
}

export function addTicker(tickers: string[], input: string): { ticker: string; tickers: string[]; error?: never } | { error: string; ticker?: never; tickers?: never } {
  const ticker = input.trim().replace(/^\$/, "").toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(ticker)) return { error: "Enter a ticker with 1–5 letters, such as AAPL." };
  if (tickers.includes(ticker)) return { error: `${ticker} is already on your watchlist.` };
  if (tickers.length >= 30) return { error: "Your watchlist is full. Remove a stock before adding another (30 maximum)." };
  return { ticker, tickers: [...tickers, ticker] };
}

export function readWatchlist(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function subscribeWatchlist(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(KEY, onChange);
  };
}

export function saveWatchlist(tickers: string[]) {
  localStorage.setItem(KEY, JSON.stringify(tickers));
  window.dispatchEvent(new Event(KEY));
}
