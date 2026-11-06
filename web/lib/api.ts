// Read API client. Every body is { notice, data }; no field carries post text or author names.
export const API_URL = "";

export const NOTICE = "Risk signal only. Not investment advice. Pumpwatch is a non-commercial project.";

export type Score = {
  ticker: string;
  score: number;
  modelVersion: string;
  windowEnd: string;
  computedAt: string;
  staleSources: string[];
};
export type Contributor = { featureGroup: string; delta: number };
export type Flag = {
  id: number;
  ticker: string;
  raisedAt: string;
  evidence: {
    score: number;
    modelVersion: string;
    topContributors: Contributor[];
    postCount: number;
    tradeCount: number;
    catalyst: { found: boolean; items: string[] } | null;
  };
};
export type Timeline = {
  ticker: string;
  from: string;
  to: string;
  scores: { at: string; score: number; modelVersion: string }[];
  flags: { id: number; at: string; score: number }[];
};

export type MarketMover = { ticker: string; price: number; changePct: number };
export type MarketMovers = {
  asOf: string; feed: string; rangeUniverseSize: number;
  gainers: MarketMover[]; losers: MarketMover[];
  ranges: (MarketMover & { rangePct: number; volume: number; at: string })[];
};
export type StockNews = {
  asOf: string; ticker: string | null;
  items: { id: string; title: string; url: string; source: string; publishedAt: string; symbols: string[] }[];
};
export type Sentiment = {
  ticker: string; enabled: boolean; model: string; modelStatus: "disabled" | "loading" | "ready" | "error";
  streamConnected: boolean; asOf: string; windowMinutes: number;
  positive: number; negative: number; neutral: number; total: number; lastPostAt: string | null; dropped: number;
};

export type DataMode = "mock" | "live";
type Envelope<T> = { notice: string; data: T; mode: DataMode };

// Short timeout so a dead API shows its error state quickly instead of hanging the page.
export async function get<T>(path: string, ms = 6000, signal?: AbortSignal): Promise<Envelope<T>> {
  const deadline = AbortSignal.timeout(ms);
  const res = await fetch(`${API_URL}${path}`, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline, cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  if (!body || typeof body.notice !== "string" || !validPublicData(path, body.data)) throw new Error("Invalid API data");
  const mode = res.headers.get("X-Pumpwatch-Data-Mode") ?? body.mode ?? "live";
  if ((mode !== "mock" && mode !== "live") || (body.mode !== undefined && body.mode !== mode)) throw new Error("Invalid data mode");
  return { ...body, mode };
}

export const STREAM_URL = `${API_URL}/api/v1/flags/stream`;

export type LandingData = { mode: DataMode; ticker: string; score: Score | null; flags: Flag[]; timeline: Timeline };

const validTicker = (t: string) => typeof t === "string" && /^[A-Z]{1,5}$/.test(t);
const validDate = (s: string) => typeof s === "string" && Number.isFinite(Date.parse(s));
const validScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
const validCount = (n: number) => Number.isSafeInteger(n) && n >= 0;
const strings = (v: string[]) => Array.isArray(v) && v.every((s) => typeof s === "string");

function validScoreView(s: Score): boolean {
  return !!(s && validTicker(s.ticker) && validScore(s.score) && validDate(s.windowEnd)
    && validDate(s.computedAt) && typeof s.modelVersion === "string" && strings(s.staleSources));
}

function validFlag(f: Flag): boolean {
  return !!(f && validTicker(f.ticker) && validCount(f.id) && validDate(f.raisedAt)
    && f.evidence && validScore(f.evidence.score) && typeof f.evidence.modelVersion === "string"
    && validCount(f.evidence.postCount) && validCount(f.evidence.tradeCount)
    && Array.isArray(f.evidence.topContributors) && f.evidence.topContributors.every((c) => c
      && typeof c.featureGroup === "string" && Number.isFinite(c.delta))
    && (f.evidence.catalyst === null || (f.evidence.catalyst && typeof f.evidence.catalyst.found === "boolean"
      && strings(f.evidence.catalyst.items))));
}

function validTimeline(t: Timeline): boolean {
  if (!t || !validTicker(t.ticker) || !validDate(t.from) || !validDate(t.to)
    || !Array.isArray(t.scores) || !Array.isArray(t.flags)) return false;
  const from = Date.parse(t.from);
  const to = Date.parse(t.to);
  if (from >= to || to - from > 48 * 3600e3) return false;
  return t.scores.every((s, i) => s && validDate(s.at) && validScore(s.score) && typeof s.modelVersion === "string"
    && Date.parse(s.at) >= from && Date.parse(s.at) <= to
    && (i === 0 || Date.parse(t.scores[i - 1].at) <= Date.parse(s.at)))
    && t.flags.every((f) => f && validCount(f.id) && validDate(f.at) && validScore(f.score)
      && Date.parse(f.at) >= from && Date.parse(f.at) <= to);
}

function validMovers(data: MarketMovers): boolean {
  const row = (r: MarketMover) => !!r && validTicker(r.ticker) && Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.changePct);
  return !!data && validDate(data.asOf) && typeof data.feed === "string" && validCount(data.rangeUniverseSize)
    && Array.isArray(data.gainers) && data.gainers.every(row) && Array.isArray(data.losers) && data.losers.every(row)
    && Array.isArray(data.ranges) && data.ranges.every((r) => row(r) && Number.isFinite(r.rangePct) && r.rangePct >= 0 && validCount(r.volume) && validDate(r.at));
}

function safeLink(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}

function validNews(data: StockNews, ticker: string | null): boolean {
  return !!data && data.ticker === ticker && validDate(data.asOf) && Array.isArray(data.items)
    && data.items.every((i) => i && typeof i.id === "string" && typeof i.title === "string" && i.title.length > 0
      && typeof i.url === "string" && safeLink(i.url) && typeof i.source === "string" && validDate(i.publishedAt)
      && strings(i.symbols));
}

function validSentiment(data: Sentiment, ticker: string): boolean {
  return !!data && data.ticker === ticker && typeof data.enabled === "boolean" && typeof data.model === "string"
    && ["disabled", "loading", "ready", "error"].includes(data.modelStatus) && typeof data.streamConnected === "boolean"
    && validDate(data.asOf) && Number.isFinite(data.windowMinutes) && data.windowMinutes > 0
    && [data.positive, data.negative, data.neutral, data.total, data.dropped].every(validCount)
    && data.total === data.positive + data.negative + data.neutral && (data.lastPostAt === null || validDate(data.lastPostAt));
}

function validPublicData(path: string, data: unknown): boolean {
  const endpoint = path.split("?")[0];
  if (endpoint === "/api/v1/market-movers") return validMovers(data as MarketMovers);
  if (endpoint === "/api/v1/news") return validNews(data as StockNews, null);
  const context = /^\/api\/v1\/tickers\/([A-Z]{1,5})\/(news|sentiment)$/.exec(endpoint);
  if (context) return context[2] === "news" ? validNews(data as StockNews, context[1]) : validSentiment(data as Sentiment, context[1]);
  if (endpoint === "/api/v1/watchlist") return Array.isArray(data) && (data as Score[]).every(validScoreView);
  if (endpoint === "/api/v1/flags") return Array.isArray(data) && (data as Flag[]).every(validFlag);
  const ticker = /^\/api\/v1\/tickers\/([A-Z]{1,5})\/timeline$/.exec(endpoint)?.[1];
  return !!ticker && validTimeline(data as Timeline) && (data as Timeline).ticker === ticker;
}

export function compareFlags(a: Flag, b: Flag) {
  return Date.parse(b.raisedAt) - Date.parse(a.raisedAt) || b.id - a.id;
}

export function parseFlagEvent(message: string): Flag | null {
  try {
    const flag = JSON.parse(message).data;
    return validFlag(flag) ? flag : null;
  } catch {
    return null;
  }
}

// One deadline covers the snapshot and its history. Invalid or unavailable data keeps the labeled simulation.
export async function loadLandingData(ms = 2500, signal?: AbortSignal): Promise<LandingData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  try {
    const [watchlist, recent] = await Promise.all([
      get<Score[]>("/api/v1/watchlist", ms, combined),
      get<Flag[]>("/api/v1/flags?limit=3", ms, combined),
    ]);
    const scores = watchlist.data;
    const flags = recent.data;
    if (watchlist.mode !== recent.mode) return null;
    scores.sort((a, b) => b.score - a.score);
    flags.sort(compareFlags);
    const ticker = flags[0]?.ticker ?? scores[0]?.ticker;
    if (!ticker) return null;
    const history = await get<Timeline>(`/api/v1/tickers/${ticker}/timeline`, ms, combined);
    const timeline = history.data;
    if (history.mode !== watchlist.mode) return null;
    return { mode: watchlist.mode, ticker, score: scores.find((s) => s.ticker === ticker) ?? null, flags, timeline };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function age(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
