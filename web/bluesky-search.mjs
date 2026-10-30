import { mentionedTickers } from "./ticker-mentions.mjs";

const DAY = 86400000;
const unavailable = () => new Error("Recent Bluesky sentiment unavailable");

export function createBlueskySearch({ sentiment, fetchImpl = fetch, now = Date.now, timeoutMs = 10000 }) {
  const cache = new Map(), pending = new Map();
  let period = now(), requests = 0;
  const remember = (key, result) => {
    cache.delete(key); cache.set(key, result);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
  };
  return async function load(ticker, sort = "top") {
    if (!/^[A-Z]{1,5}$/.test(ticker) || !["top", "latest"].includes(sort)) throw new Error("Invalid sentiment search");
    const state = sentiment.snapshot(ticker);
    const base = { ...state, windowMinutes: 1440, positive: 0, neutral: 0, negative: 0, total: 0, lastPostAt: null, dropped: 0, sample: { sort, examined: 0 } };
    if (!state.enabled || state.modelStatus !== "ready") return base;
    const key = `${ticker}:${sort}`, previous = cache.get(key);
    if (previous && previous.expiresAt > now()) {
      if (previous.error) throw unavailable();
      return previous.data;
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 4) throw unavailable();
    if (now() < period || now() - period >= 60000) { period = now(); requests = 0; }
    if (requests >= 30) throw unavailable();
    requests++;
    const controller = new AbortController();
    let timer;
    const request = Promise.resolve().then(async () => {
      try {
        const at = now();
        const work = async () => {
          const url = new URL("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts");
          url.search = new URLSearchParams({ q: `$${ticker}`, sort, since: new Date(at - DAY).toISOString(), until: new Date(at).toISOString(), limit: "50", lang: "en" });
          const response = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
          const body = await response.json();
          if (!body || !Array.isArray(body.posts)) throw unavailable();
          const posts = body.posts.slice(0, 50), seen = new Set();
          const data = { ...base, asOf: new Date(at).toISOString(), sample: { sort, examined: posts.length } };
          for (const post of posts) {
            if (controller.signal.aborted) throw unavailable();
            const text = post?.record?.text, createdAt = post?.record?.createdAt;
            const created = Date.parse(createdAt);
            if (typeof post?.uri !== "string" || !/^at:\/\/did:[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(post.uri)
              || seen.has(post.uri) || typeof text !== "string" || !text.length || text.length > 10000
              || typeof createdAt !== "string" || !Number.isFinite(created) || created < at - DAY || created > at
              || !mentionedTickers(text).has(ticker)) continue;
            seen.add(post.uri);
            const label = await sentiment.classify(text.slice(0, 3000));
            if (!["positive", "neutral", "negative"].includes(label)) throw unavailable();
            data[label]++; data.total++;
            if (data.lastPostAt === null || created > Date.parse(data.lastPostAt)) data.lastPostAt = new Date(created).toISOString();
            if (data.total === 25) break;
          }
          return data;
        };
        const data = await Promise.race([work(), new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs);
        })]);
        remember(key, { data, expiresAt: now() + 60000 });
        return data;
      } catch {
        remember(key, { error: true, expiresAt: now() + 5000 });
        throw unavailable();
      } finally { clearTimeout(timer); controller.abort(); pending.delete(key); }
    });
    pending.set(key, request);
    return request;
  };
}
