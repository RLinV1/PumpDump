const ORIGIN = "https://data.alpaca.markets";
const tickerPattern = /^[A-Z]{1,5}$/;
const marketDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});
const validTicker = (value) => typeof value === "string" && tickerPattern.test(value);
const positive = (value) => Number.isFinite(value) && value > 0;
const unavailable = () => new Error("Market movers unavailable");

function sessionDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const parts = Object.fromEntries(marketDate.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function rankedMovers(rows, gaining) {
  const seen = new Set();
  return rows.filter((row) => row && validTicker(row.symbol) && positive(row.price)
    && Number.isFinite(row.percent_change) && row.percent_change >= -100
    && (gaining ? row.percent_change >= 0 : row.percent_change <= 0))
    .sort((a, b) => gaining ? b.percent_change - a.percent_change : a.percent_change - b.percent_change)
    .filter((row) => !seen.has(row.symbol) && seen.add(row.symbol)).slice(0, 10)
    .map((row) => ({ ticker: row.symbol, price: row.price, changePct: row.percent_change }));
}

function rangeFor(ticker, snapshot, session) {
  const bar = snapshot?.dailyBar;
  const previous = snapshot?.prevDailyBar;
  const previousDate = sessionDate(previous?.t);
  if (!bar || sessionDate(bar.t) !== session || !previousDate || previousDate >= session
    || !positive(previous.c) || !positive(bar.o) || !positive(bar.h) || !positive(bar.l) || !positive(bar.c)
    || bar.h < bar.l || bar.o < bar.l || bar.o > bar.h || bar.c < bar.l || bar.c > bar.h
    || !Number.isSafeInteger(bar.v) || bar.v < 0) return null;
  const rangePct = (bar.h - bar.l) / previous.c * 100;
  const changePct = (bar.c - previous.c) / previous.c * 100;
  if (!Number.isFinite(rangePct) || !Number.isFinite(changePct)) return null;
  return { ticker, price: bar.c, changePct, rangePct, volume: bar.v, at: bar.t };
}

// One shared read per cache interval keeps each dashboard visitor from multiplying provider requests.
export function createMarketMoversLoader({ fetchImpl = fetch, keyId, secretKey, feed = "iex", watchlist = [], now = Date.now } = {}) {
  const watched = Array.isArray(watchlist) ? watchlist.filter(validTicker).slice(0, 30) : [];
  let cached;
  let cachedAt = 0;
  let inFlight;
  let failedUntil = 0;

  async function read() {
    if (typeof keyId !== "string" || !keyId.trim() || typeof secretKey !== "string" || !secretKey.trim()
      || !["iex", "sip", "delayed_sip"].includes(feed)) throw unavailable();
    const controller = new AbortController();
    const headers = { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey };
    const json = async (path) => {
      const response = await fetchImpl(`${ORIGIN}${path}`, { headers, signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw unavailable();
      return response.json();
    };
    let timer;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, 5000);
    });
    const request = async () => {
      const [movers, active] = await Promise.all([
        json("/v1beta1/screener/stocks/movers?top=10"),
        json("/v1beta1/screener/stocks/most-actives?by=volume&top=20"),
      ]);
      const session = sessionDate(movers?.last_updated);
      if (!session || !Array.isArray(movers.gainers) || !Array.isArray(movers.losers)
        || !Array.isArray(active?.most_actives)) throw unavailable();
      const gainers = rankedMovers(movers.gainers, true);
      const losers = rankedMovers(movers.losers, false);
      const candidates = [...new Set([
        ...watched, ...gainers.map((row) => row.ticker), ...losers.map((row) => row.ticker),
        ...active.most_actives.map((row) => row?.symbol).filter(validTicker).slice(0, 20),
      ])].slice(0, 70);
      let ranges = [];
      if (candidates.length) {
        const query = new URLSearchParams({ symbols: candidates.join(","), feed });
        const snapshots = await json(`/v2/stocks/snapshots?${query}`);
        if (!snapshots || typeof snapshots !== "object" || Array.isArray(snapshots)) throw unavailable();
        ranges = candidates.map((ticker) => rangeFor(ticker, snapshots[ticker], session)).filter(Boolean)
          .sort((a, b) => b.rangePct - a.rangePct || a.ticker.localeCompare(b.ticker)).slice(0, 10);
      }
      return { asOf: movers.last_updated, feed, rangeUniverseSize: candidates.length, gainers, losers, ranges };
    };
    try { return await Promise.race([request(), deadline]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  return function load() {
    if (cached && now() - cachedAt < 30000) return Promise.resolve(cached);
    if (inFlight) return inFlight;
    if (now() < failedUntil) return Promise.reject(unavailable());
    inFlight = read().then((data) => {
      cached = data;
      cachedAt = now();
      failedUntil = 0;
      return data;
    }, () => {
      failedUntil = now() + 5000;
      throw unavailable();
    }).finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
