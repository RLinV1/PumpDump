const ORIGIN = "https://data.alpaca.markets";
const tickerPattern = /^[A-Z]{1,5}$/;
const marketDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const positive = (value) => Number.isFinite(value) && value > 0;
const unavailable = () => new Error("Quotes unavailable");

export const MAX_QUOTE_SYMBOLS = 30;

// Returns a sorted, de-duplicated list, or null when any symbol is invalid or the list is empty or too long.
export function parseSymbols(raw) {
  if (typeof raw !== "string") return null;
  const list = [...new Set(raw.split(","))];
  if (list.length < 1 || list.length > MAX_QUOTE_SYMBOLS || !list.every((s) => tickerPattern.test(s))) return null;
  return list.sort();
}

function sessionDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const parts = Object.fromEntries(marketDate.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Last trade against the previous session close. Anything that cannot be derived honestly is dropped, never guessed.
function quoteFor(ticker, snapshot) {
  const trade = snapshot?.latestTrade;
  const price = positive(trade?.p) ? trade.p : null;
  const day = sessionDate(trade?.t);
  if (price === null || !day) return null;
  const barDay = sessionDate(snapshot.dailyBar?.t);
  const base = barDay === day ? snapshot.prevDailyBar?.c : barDay && barDay < day ? snapshot.dailyBar?.c : null;
  if (!positive(base)) return null;
  return { ticker, price, changePct: (price - base) / base * 100, prevClose: base, at: trade.t };
}

// Same shape as createMarketMoversLoader: one shared, cached, deadline-bound read per distinct symbol set.
export function createQuotesLoader({ fetchImpl = fetch, keyId, secretKey, feed = "iex", now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const failedUntil = new Map();

  async function read(symbols) {
    if (typeof keyId !== "string" || !keyId.trim() || typeof secretKey !== "string" || !secretKey.trim()
      || !["iex", "sip", "delayed_sip"].includes(feed)) throw unavailable();
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, 5000);
    });
    const request = async () => {
      const query = new URLSearchParams({ symbols: symbols.join(","), feed });
      const response = await fetchImpl(`${ORIGIN}/v2/stocks/snapshots?${query}`, {
        headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey }, signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) throw unavailable();
      const snapshots = await response.json();
      if (!snapshots || typeof snapshots !== "object" || Array.isArray(snapshots)) throw unavailable();
      const quotes = symbols.map((ticker) => quoteFor(ticker, snapshots[ticker])).filter(Boolean);
      return { asOf: new Date(now()).toISOString(), feed, quotes };
    };
    try { return await Promise.race([request(), deadline]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  return function load(input) {
    const symbols = parseSymbols(Array.isArray(input) ? input.join(",") : input);
    if (!symbols) return Promise.reject(new Error("Invalid symbols"));
    const key = symbols.join(",");
    const hit = cache.get(key);
    if (hit && now() - hit.at < 15000) return Promise.resolve(hit.data);
    if (inFlight.has(key)) return inFlight.get(key);
    if (now() < (failedUntil.get(key) ?? 0)) return Promise.reject(unavailable());
    const pending = read(symbols).then((data) => {
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(key, { at: now(), data });
      failedUntil.delete(key);
      return data;
    }, () => {
      if (failedUntil.size >= 50) failedUntil.delete(failedUntil.keys().next().value);
      failedUntil.set(key, now() + 5000);
      throw unavailable();
    }).finally(() => { inFlight.delete(key); });
    inFlight.set(key, pending);
    return pending;
  };
}
