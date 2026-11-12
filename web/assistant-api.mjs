// POST /api/v1/assistant/ask: the one public door to the research assistant (Research). It validates, rate-limits, then
// forwards to the private service, so the service never sees an unchecked request and the Gemini key cannot be drained.
// The assistant has read-only tools. An optional context string (the flag on screen) rides along and is capped here.
const NOTICE = "Not investment advice. Pumpwatch is a non-commercial project.";
export const MAX_QUESTION = 300;
export const MAX_CONTEXT = 600;
const MAX_BODY = 4096;
const WINDOW_MS = 60_000;
const PER_CLIENT = 5; // questions per minute per client address
const ALL_CLIENTS = 30; // and per minute across everyone: the spend cap
const MAX_TRACKED = 5000;

export function createAssistantApi({ origin, fetchImpl = fetch, now = Date.now } = {}) {
  const hits = new Map(); // client -> request times inside the window; shortcut: in memory, resets on restart
  let all = [];
  const allowed = (client) => {
    const t = now();
    all = all.filter((x) => t - x < WINDOW_MS);
    const mine = (hits.get(client) ?? []).filter((x) => t - x < WINDOW_MS);
    if (mine.length >= PER_CLIENT || all.length >= ALL_CLIENTS) return false;
    if (hits.size >= MAX_TRACKED) for (const [k, v] of hits) if (!v.some((x) => t - x < WINDOW_MS)) hits.delete(k);
    mine.push(t); all.push(t); hits.set(client, mine);
    return true;
  };

  return (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/v1/assistant")) return false;
    const json = (status, data, error, extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      response.setHeader("Cache-Control", "no-store");
      for (const [k, v] of Object.entries(extra)) response.setHeader(k, v);
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ notice: NOTICE, ...(error ? { error } : { data }) }));
    };
    if (url.pathname !== "/api/v1/assistant/ask") { json(404, null, "unknown endpoint"); return true; }
    if (request.method !== "POST") { json(405, null, "POST only", { Allow: "POST" }); return true; }
    if (!origin) { json(503, null, "The assistant is not enabled"); return true; }
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) { json(415, null, "Send JSON"); return true; }

    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) json(413, null, "Request too large", { Connection: "close" }); else chunks.push(chunk);
    });
    request.on("end", async () => {
      if (size > MAX_BODY) return;
      let question, context;
      try { ({ question, context } = JSON.parse(Buffer.concat(chunks).toString("utf8")) ?? {}); } catch { /* handled below */ }
      if (typeof question !== "string" || !question.trim() || /[\u0000-\u001f]/.test(question)) return json(400, null, "Send a question");
      question = question.trim();
      if (context !== undefined && (typeof context !== "string" || context.length > MAX_CONTEXT || /[\u0000-\u001f]/.test(context))) return json(400, null, "Flag context is invalid");
      if (question.length > MAX_QUESTION) return json(400, null, `Questions are limited to ${MAX_QUESTION} characters`);
      // The server already replaced x-forwarded-for with the real peer (see server-headers.mjs).
      if (!allowed(request.headers["x-forwarded-for"] ?? "unknown")) return json(429, null, "Too many questions. Try again in a minute.", { "Retry-After": "60" });
      try {
        const upstream = await fetchImpl(`${origin}/assistant/ask`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context?.trim() ? { question, context: context.trim() } : { question }), signal: AbortSignal.timeout(45_000),
        });
        if (upstream.status === 429) return json(429, null, "The assistant is busy. Try again in a minute.", { "Retry-After": "60" });
        const body = upstream.ok ? await upstream.json() : null;
        const ok = body && typeof body.answer === "string" && Array.isArray(body.tools_used) && Array.isArray(body.sources)
          && (body.mode?.data === "mock" || body.mode?.data === "live");
        if (!ok) return json(502, null, "The assistant could not answer");
        response.setHeader("X-Pumpwatch-Data-Mode", body.mode.data);
        json(200, {
          answer: body.answer,
          toolsUsed: body.tools_used.filter((t) => typeof t === "string"),
          sources: body.sources.filter((s) => s && typeof s.title === "string").map((s) => ({ kind: String(s.kind), title: s.title, url: typeof s.url === "string" ? s.url : null })),
          llm: body.mode.llm === "gemini" ? "gemini" : "mock",
          note: typeof body.note === "string" ? body.note.slice(0, 200) : "",
          dataMode: body.mode.data,
        });
      } catch { json(503, null, "The assistant is temporarily unavailable"); }
    });
    return true;
  };
}
