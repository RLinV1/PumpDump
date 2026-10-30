const DAY = 24 * 3600e3;
const MAX_KEYS = 31;
const tickerPattern = /^[A-Z]{1,5}$/;
const unavailable = () => new Error("News is temporarily unavailable.");

function publicArticle(article, ticker, at) {
  if (!article || typeof article !== "object") return null;
  const id = Number.isSafeInteger(article.id) && article.id >= 0 ? String(article.id) : article.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const cleanText = (value, limit) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit) : "";
  const title = cleanText(article.headline, 500);
  const source = cleanText(article.source, 80);
  const published = typeof article.created_at === "string" ? Date.parse(article.created_at) : NaN;
  if (!title || !source || !Number.isFinite(published) || published < at - DAY || published > at
    || !Array.isArray(article.symbols) || typeof article.url !== "string"
    || !/^https:\/\//i.test(article.url) || /[\s\\\u0000-\u001f\u007f]/.test(article.url)) return null;
  let url;
  try { url = new URL(article.url); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  const symbols = [...new Set(article.symbols.filter((value) => typeof value === "string" && tickerPattern.test(value)))];
  if (ticker && !symbols.includes(ticker)) return null;
  return { id, title, url: url.href, source, publishedAt: new Date(published).toISOString(), symbols };
}

// Headlines and source links only; article bodies, summaries and authors never leave this adapter.
export function createStockNewsLoader({ keyId, secretKey, fetchImpl = fetch, now = Date.now, timeoutMs = 5000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  let allowanceStarted = now();
  let requests = 0;
  const remember = (key, entry) => {
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > MAX_KEYS) cache.delete(cache.keys().next().value);
  };
  return async function load(ticker = null) {
    if (ticker !== null && (typeof ticker !== "string" || !tickerPattern.test(ticker))) throw new TypeError("Invalid ticker");
    if (typeof keyId !== "string" || !keyId.trim() || typeof secretKey !== "string" || !secretKey.trim()) throw new Error("News is not configured.");
    const key = ticker ?? "market";
    const previous = cache.get(key);
    if (previous && previous.expiresAt > now()) {
      remember(key, previous);
      if (previous.error) throw unavailable();
      return previous.data;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= MAX_KEYS) throw unavailable();
    const requestedAt = now();
    if (requestedAt < allowanceStarted || requestedAt - allowanceStarted >= 60000) {
      allowanceStarted = requestedAt;
      requests = 0;
    }
    if (requests >= 90) throw unavailable(); // Leave room for the app's other Alpaca calls.
    requests++;
    const request = Promise.resolve().then(async () => {
      try {
        const url = new URL("https://data.alpaca.markets/v1beta1/news");
        url.searchParams.set("start", new Date(now() - DAY).toISOString());
        url.searchParams.set("sort", "desc");
        url.searchParams.set("limit", "12");
        url.searchParams.set("include_content", "false");
        if (ticker) url.searchParams.set("symbols", ticker);
        // Omitting end lets Alpaca apply any delay required by the account's news entitlement.
        const response = await fetchImpl(url, {
          headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey },
          signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw unavailable();
        }
        const body = await response.json();
        if (!body || !Array.isArray(body.news)) throw unavailable();
        const at = now();
        const seen = new Set();
        const items = body.news.map((item) => publicArticle(item, ticker, at)).filter(Boolean)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
          .filter((item) => !seen.has(item.id) && seen.add(item.id)).slice(0, 12);
        const data = { asOf: new Date(at).toISOString(), ticker, items };
        remember(key, { data, expiresAt: now() + 60000 });
        return data;
      } catch {
        remember(key, { error: true, expiresAt: now() + 5000 });
        throw unavailable();
      } finally {
        pending.delete(key);
      }
    });
    pending.set(key, request);
    return request;
  };
}
