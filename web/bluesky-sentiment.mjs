import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const MODEL = "Xenova/distilroberta-finetuned-financial-news-sentiment-analysis";
const REVISION = "e6953e30167c7fc3d1ad62f3df31617dd712fbc1";
const WINDOW = 3600000;
const FINANCE = /\b(stock|shares?|earnings|revenue|profit|trading|invest|bullish|bearish|market|buy|sell|rally|price)\b/i;
const LABELS = new Set(["positive", "negative", "neutral"]);

async function loadClassifier(cacheDir) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = cacheDir;
  const classifier = await pipeline("text-classification", MODEL, {
    revision: REVISION, dtype: "q8", device: "cpu",
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  });
  return (text) => classifier(text, { truncation: true, max_length: 256 });
}

// Public posts are classified locally. Only hashed record ids and per-ticker labels survive inference in memory.
export function createBlueskySentiment({
  watchlist = [], enabled = false, classify: injectedClassifier,
  webSocketFactory = (url) => new WebSocket(url), now = Date.now,
  cacheDir = fileURLToPath(new URL("../.playwright-mcp/sentiment-model-cache/", import.meta.url)),
  maxQueue = 64, maxSamples = 10000, inferenceTimeoutMs = 10000,
  reconnectDelayMs = 1000,
} = {}) {
  const tickers = new Set(watchlist.filter((ticker) => typeof ticker === "string" && /^[A-Z]{1,5}$/.test(ticker)));
  const selectedTickers = new Map();
  if (![maxQueue, maxSamples, inferenceTimeoutMs, reconnectDelayMs].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error("Invalid sentiment limits");
  const records = new Map();
  const queue = [];
  let classifier = injectedClassifier;
  let modelStatus = enabled ? "loading" : "disabled";
  let running = false, connected = false, busy = false, generation = 0, dropped = 0;
  let socket, reconnectTimer, connectTimer, startPromise, cursor, reconnects = 0;

  function prune() {
    const cutoff = now() - WINDOW;
    for (const [ticker, requestedAt] of selectedTickers) {
      if (requestedAt < cutoff) selectedTickers.delete(ticker);
    }
    let samples = 0;
    for (const [id, record] of records) {
      if (record.at < cutoff) records.delete(id);
      else if (record.label) samples++;
    }
    for (const [id, record] of records) {
      if (samples <= maxSamples && records.size <= maxSamples + maxQueue + 1) break;
      if (record.label || record.deleted) {
        records.delete(id);
        if (record.label) { samples--; dropped++; }
      }
    }
  }

  function matching(text) {
    const found = new Set();
    for (const match of text.matchAll(/(?<![\w$])\$([A-Za-z]{1,5})\b/g)) {
      const ticker = match[1].toUpperCase();
      if (tickers.has(ticker) || selectedTickers.has(ticker)) found.add(ticker);
    }
    if (FINANCE.test(text)) for (const match of text.matchAll(/\b[A-Z]{1,5}\b/g)) {
      if (tickers.has(match[0]) || selectedTickers.has(match[0])) found.add(match[0]);
    }
    return [...found];
  }

  async function drain() {
    if (busy || !running || modelStatus !== "ready") return;
    busy = true;
    const epoch = generation;
    try {
      while (running && epoch === generation && modelStatus === "ready" && queue.length) {
        const item = queue.shift();
        if (records.get(item.id) !== item.record || item.record.at < now() - WINDOW) continue;
        let timer;
        try {
          const work = Promise.resolve(classifier(item.text));
          item.text = "";
          const prediction = await Promise.race([work, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Sentiment inference timed out")), inferenceTimeoutMs);
            timer.unref?.();
          })]);
          const result = Array.isArray(prediction) ? prediction[0] : prediction;
          const label = typeof result === "string" ? result.toLowerCase() : result?.label?.toLowerCase();
          if (!LABELS.has(label)) throw new Error("Invalid sentiment prediction");
          if (running && epoch === generation && records.get(item.id) === item.record) item.record.label = label;
          prune();
        } catch {
          if (running && epoch === generation) {
            modelStatus = "error";
            dropped += 1 + queue.length;
            for (const pending of queue.splice(0)) {
              pending.text = "";
              if (records.get(pending.id) === pending.record) records.delete(pending.id);
            }
            if (records.get(item.id) === item.record) records.delete(item.id);
          }
        } finally {
          item.text = "";
          clearTimeout(timer);
        }
      }
    } finally { busy = false; }
  }

  function ingest(input) {
    if (!enabled || !running || modelStatus !== "ready") return false;
    let event = input;
    if (typeof event === "string") {
      if (event.length > 1000000) return false;
      try { event = JSON.parse(event); } catch { return false; }
    }
    const commit = event?.commit;
    if (!event || event.kind !== "commit" || typeof event.did !== "string" || event.did.length > 256
      || !event.did.startsWith("did:") || commit?.collection !== "app.bsky.feed.post"
      || typeof commit.rkey !== "string" || !commit.rkey.length || commit.rkey.length > 256
      || !Number.isSafeInteger(event.time_us)) return false;
    const eventAt = Math.floor(event.time_us / 1000);
    if (eventAt < now() - WINDOW || eventAt > now() + 300000) return false;
    cursor = Math.max(cursor ?? event.time_us, event.time_us);
    const id = createHash("sha256").update(`${event.did}/${commit.rkey}`).digest("hex");
    prune();
    const previous = records.get(id);
    if (commit.operation === "delete") {
      if (!previous) return false;
      records.set(id, { at: eventAt, eventAt, deleted: true, tickers: [], label: null });
      return true;
    }
    if (commit.operation !== "create" && commit.operation !== "update") return false;
    if (previous && (commit.operation === "create" || eventAt <= previous.eventAt || previous.deleted)) return false;
    const record = commit.record;
    if (!record || typeof record.text !== "string" || !record.text.length || record.text.length > 10000
      || typeof record.createdAt !== "string") return false;
    const at = Date.parse(record.createdAt);
    if (!Number.isFinite(at) || at < now() - WINDOW || at > now() + 300000) return false;
    const found = matching(record.text);
    if (!found.length) {
      if (previous) records.set(id, { at: eventAt, eventAt, deleted: true, tickers: [], label: null });
      return false;
    }
    if (queue.length >= maxQueue) { dropped++; return false; }
    const aggregate = { at, eventAt, tickers: found, label: null };
    records.set(id, aggregate);
    queue.push({ id, record: aggregate, text: record.text.slice(0, 3000) });
    void drain();
    return true;
  }

  function connect() {
    if (!running) return;
    const url = new URL("wss://jetstream2.us-east.bsky.network/subscribe");
    url.searchParams.set("wantedCollections", "app.bsky.feed.post");
    if (cursor) url.searchParams.set("cursor", String(cursor));
    let current;
    const retry = () => {
      if (socket !== current) return;
      connected = false; socket = undefined;
      clearTimeout(connectTimer);
      try { current?.close(); } catch { /* Socket already closed. */ }
      if (running) {
        reconnectTimer = setTimeout(connect, Math.min(30000, reconnectDelayMs * 2 ** Math.min(reconnects++, 5)));
        reconnectTimer.unref?.();
      }
    };
    try {
      current = socket = webSocketFactory(url.toString());
      current.addEventListener("open", () => {
        if (socket !== current || !running) return;
        connected = true; reconnects = 0; clearTimeout(connectTimer);
      });
      current.addEventListener("message", (event) => {
        if (socket === current && running) ingest(event.data);
      });
      current.addEventListener("close", retry);
      current.addEventListener("error", retry);
      connectTimer = setTimeout(retry, 15000);
      connectTimer.unref?.();
    } catch {
      current = socket;
      retry();
    }
  }

  function start() {
    if (!enabled) return Promise.resolve();
    if (running) return startPromise;
    running = true;
    const epoch = ++generation;
    modelStatus = "loading";
    startPromise = (async () => {
      try {
        classifier ??= await loadClassifier(cacheDir);
        if (!running || epoch !== generation) return;
        modelStatus = "ready";
        connect();
      } catch {
        if (running && epoch === generation) modelStatus = "error";
      }
    })();
    return startPromise;
  }

  function stop() {
    running = false; generation++; connected = false;
    clearTimeout(reconnectTimer); clearTimeout(connectTimer);
    const current = socket; socket = undefined;
    try { current?.close(); } catch { /* Socket already closed. */ }
    for (const item of queue.splice(0)) {
      item.text = "";
      if (records.get(item.id) === item.record) records.delete(item.id);
    }
  }

  function snapshot(ticker) {
    prune();
    if (enabled && /^[A-Z]{1,5}$/.test(ticker) && !tickers.has(ticker)) {
      selectedTickers.delete(ticker);
      selectedTickers.set(ticker, now());
      if (selectedTickers.size > 64) selectedTickers.delete(selectedTickers.keys().next().value);
    }
    const counts = { positive: 0, negative: 0, neutral: 0 };
    let last = null;
    for (const record of records.values()) if (record.label && record.tickers.includes(ticker)) {
      counts[record.label]++;
      last = Math.max(last ?? record.at, record.at);
    }
    return {
      ticker, enabled, model: MODEL, modelStatus, streamConnected: connected,
      asOf: new Date(now()).toISOString(), windowMinutes: 60, ...counts,
      total: counts.positive + counts.negative + counts.neutral,
      lastPostAt: last === null ? null : new Date(last).toISOString(), dropped,
    };
  }

  return { start, stop, snapshot, ingest };
}
