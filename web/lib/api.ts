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
export type Quote = { ticker: string; price: number; changePct: number; prevClose: number; at: string };
export type Quotes = { asOf: string; feed: string; quotes: Quote[] };
export type StockNews = {
  asOf: string; ticker: string | null;
  items: { id: string; title: string; url: string; source: string; publishedAt: string; symbols: string[]; sentiment?: "positive" | "negative" | "neutral" }[];
  sentimentModel?: string; sentimentStatus?: "ready" | "error" | "busy";
};
export type Sentiment = {
  ticker: string; enabled: boolean; model: string; modelStatus: "disabled" | "loading" | "ready" | "error";
  streamConnected: boolean; asOf: string; windowMinutes: number;
  positive: number; negative: number; neutral: number; total: number; lastPostAt: string | null; dropped: number;
  sample?: { sort: "top" | "latest"; examined: number };
  modelName?: string; ironyModel?: string; irony?: number;
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

function validQuotes(data: Quotes): boolean {
  const seen = new Set<string>();
  return !!data && validDate(data.asOf) && typeof data.feed === "string" && Array.isArray(data.quotes) && data.quotes.length <= 30
    && data.quotes.every((q) => !!q && validTicker(q.ticker) && !seen.has(q.ticker) && !!seen.add(q.ticker)
      && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(q.prevClose) && q.prevClose > 0
      && Number.isFinite(q.changePct) && q.changePct > -100 && validDate(q.at));
}

function safeLink(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}

function validNews(data: StockNews, ticker: string | null): boolean {
  return !!data && data.ticker === ticker && validDate(data.asOf) && Array.isArray(data.items)
    && data.items.every((i) => i && typeof i.id === "string" && typeof i.title === "string" && i.title.length > 0
      && typeof i.url === "string" && safeLink(i.url) && typeof i.source === "string" && validDate(i.publishedAt)
      && strings(i.symbols) && (i.sentiment === undefined || ["positive", "negative", "neutral"].includes(i.sentiment)))
    && (data.sentimentModel === undefined || typeof data.sentimentModel === "string")
    && (data.sentimentStatus === undefined || ["ready", "error", "busy"].includes(data.sentimentStatus));
}

function validSentiment(data: Sentiment, ticker: string): boolean {
  return !!data && data.ticker === ticker && typeof data.enabled === "boolean" && typeof data.model === "string"
    && ["disabled", "loading", "ready", "error"].includes(data.modelStatus) && typeof data.streamConnected === "boolean"
    && validDate(data.asOf) && Number.isFinite(data.windowMinutes) && data.windowMinutes > 0
    && [data.positive, data.negative, data.neutral, data.total, data.dropped].every(validCount)
    && data.total === data.positive + data.negative + data.neutral && (data.lastPostAt === null || validDate(data.lastPostAt))
      && (data.modelName === undefined || typeof data.modelName === "string") && (data.ironyModel === undefined || typeof data.ironyModel === "string")
      && (data.irony === undefined || (validCount(data.irony) && data.irony <= data.total))
    && (data.sample === undefined || (!!data.sample && ["top", "latest"].includes(data.sample.sort)
      && validCount(data.sample.examined) && data.sample.examined <= 50 && data.total <= Math.min(25, data.sample.examined) && data.windowMinutes === 1440));
}

function validPublicData(path: string, data: unknown): boolean {
  const endpoint = path.split("?")[0];
  if (endpoint === "/api/v1/market-movers") return validMovers(data as MarketMovers);
  if (endpoint === "/api/v1/quotes") return validQuotes(data as Quotes);
  if (endpoint === "/api/v1/news") return validNews(data as StockNews, null);
  const context = /^\/api\/v1\/tickers\/([A-Z]{1,5})\/(news|sentiment)$/.exec(endpoint);
  if (context) {
    if (context[2] === "news") return validNews(data as StockNews, context[1]);
    const sentiment = data as Sentiment;
    const sample = new URLSearchParams(path.split("?")[1]).get("sample") ?? "stream";
    return validSentiment(sentiment, context[1]) && (sample === "stream" ? sentiment.sample === undefined : sentiment.sample?.sort === sample);
  }
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


// ---- Stock lookup and simulated paper trading. Money is integer cents; nothing here is a real order. ----
export type Lookup = {
  ticker: string; name: string; sector: string; price: number; changePct: number; marketCap: number | null; peRatio: number | null;
  performance: Record<string, number | null>;
  indicators: { sma50: number | null; sma200: number | null; rsi: number | null; low52w: number | null; high52w: number | null; rangePosition: number | null; trend: "above" | "below" | null };
  risk: { beta: number | null; volatilityPct: number | null; movement: string; sensitivity: string; benchmark: string };
  dataMode: DataMode;
};
export type PaperPosition = { ticker: string; qty: number; avgCostCents: number; costCents: number; markCents: number | null; valueCents: number | null; pnlCents: number | null };
export type PaperOrder = { id: number; ts: number; side: "BUY" | "SELL"; ticker: string; qty: number; priceCents: number };
export type PaperAccount = {
  cashCents: number; positionsValueCents: number; totalCents: number; startCents: number; pnlCents: number; realizedCents: number;
  positions: PaperPosition[]; orders: PaperOrder[]; dataMode: DataMode; fill?: { side: "BUY" | "SELL"; ticker: string; qty: number; priceCents: number };
};

const TOKEN_KEY = "pumpwatch.paper.token";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;

// An anonymous account is just a random token this browser keeps. Lose it and the account is gone; there is no sign-in.
export function paperToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && TOKEN_SHAPE.test(saved)) return saved;
  } catch { /* storage blocked: fall through to a token for this page view */ }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* the account then lasts until this page closes */ }
  return token;
}

const isMode = (m: unknown): m is DataMode => m === "mock" || m === "live";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nullNum = (v: unknown) => v === null || num(v);

async function send<T>(path: string, init: RequestInit, signal: AbortSignal | undefined, valid: (d: T) => boolean): Promise<{ notice: string; data: T }> {
  const res = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)]), cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Unavailable (${res.status}).`);
  if (typeof body?.notice !== "string" || !body.data || !isMode(body.data.dataMode) || !valid(body.data)) throw new Error("The server sent an unreadable answer.");
  return body;
}

export const getLookup = (ticker: string, signal?: AbortSignal) => send<Lookup>(`/api/v1/lookup/${ticker}`, {}, signal, (d) =>
  d.ticker === ticker && num(d.price) && num(d.changePct) && typeof d.name === "string" && !!d.performance && !!d.indicators && !!d.risk && nullNum(d.marketCap) && nullNum(d.peRatio));

const validAccount = (d: PaperAccount) => num(d.cashCents) && num(d.totalCents) && num(d.pnlCents) && num(d.startCents) && num(d.realizedCents) && num(d.positionsValueCents)
  && Array.isArray(d.positions) && d.positions.every((p) => typeof p.ticker === "string" && num(p.qty) && num(p.avgCostCents) && nullNum(p.markCents) && nullNum(p.pnlCents))
  && Array.isArray(d.orders) && d.orders.every((o) => typeof o.ticker === "string" && (o.side === "BUY" || o.side === "SELL") && num(o.qty) && num(o.priceCents));
const mine = () => ({ "X-Paper-Token": paperToken() });

export const getPaperAccount = (signal?: AbortSignal) => send<PaperAccount>("/api/v1/paper/account", { headers: mine() }, signal, validAccount);
export const placePaperOrder = (side: "BUY" | "SELL", ticker: string, qty: number, signal?: AbortSignal) =>
  send<PaperAccount>("/api/v1/paper/orders", { method: "POST", headers: { ...mine(), "Content-Type": "application/json" }, body: JSON.stringify({ side, ticker, qty }) }, signal, validAccount);
export const resetPaperAccount = (signal?: AbortSignal) =>
  send<PaperAccount>("/api/v1/paper/reset", { method: "POST", headers: { ...mine(), "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }, signal, validAccount);

export type AssistantSource = { kind: string; title: string; url: string | null };
export type AssistantAnswer = { answer: string; toolsUsed: string[]; sources: AssistantSource[]; llm: "mock" | "gemini"; note: string; dataMode: DataMode };

// The research assistant. Errors carry the server's own short message, which never includes provider details.
export async function askAssistant(question: string, signal: AbortSignal): Promise<{ notice: string; data: AssistantAnswer }> {
  const res = await fetch(`${API_URL}/api/v1/assistant/ask`, {
    method: "POST", headers: { "Content-Type": "application/json", ...mine() }, body: JSON.stringify({ question }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(50_000)]), cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `The assistant is unavailable (${res.status}).`);
  const d = body?.data;
  const ok = typeof body?.notice === "string" && d && typeof d.answer === "string" && strings(d.toolsUsed)
    && Array.isArray(d.sources) && d.sources.every((s: AssistantSource) => s && typeof s.kind === "string" && typeof s.title === "string")
    && (d.dataMode === "mock" || d.dataMode === "live") && (d.llm === "mock" || d.llm === "gemini") && typeof d.note === "string";
  if (!ok) throw new Error("The assistant sent an unreadable answer.");
  d.sources = d.sources.map((s: AssistantSource) => ({ ...s, url: s.url && safeLink(s.url) ? s.url : null }));
  return body;
}
