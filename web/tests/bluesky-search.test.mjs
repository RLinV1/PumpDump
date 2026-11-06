import assert from "node:assert/strict";
import test from "node:test";
import { createBlueskySearch } from "../bluesky-search.mjs";

const NOW = Date.parse("2026-10-30T18:00:00Z");
const post = (id, text, at = NOW - 60000) => ({ uri: `at://did:plc:private/app.bsky.feed.post/${id}`, record: { text, createdAt: new Date(at).toISOString() }, author: { handle: "PRIVATE_AUTHOR" } });
const snapshot = (ticker) => ({ ticker, enabled: true, model: "pretrained", modelStatus: "ready", streamConnected: true, asOf: new Date(NOW).toISOString(), windowMinutes: 60, positive: 8, negative: 0, neutral: 0, total: 8, lastPostAt: null, dropped: 0 });

test("top-post sentiment searches 24 hours and classifies relevant unique posts only", async () => {
  const texts = [], urls = [];
  const load = createBlueskySearch({ now: () => NOW, sentiment: { snapshot, classify: async (text) => { texts.push(text); return text.includes("loss") ? "negative" : "positive"; } }, fetchImpl: async (url) => {
    urls.push(new URL(url));
    return Response.json({ posts: [post("one", "$AMC profits grew PRIVATE_POST"), post("one", "$AMC duplicate"), post("two", "AMC shares face a loss"), post("tv", "AMC has a new TV series"), post("other", "$NVDA earnings"), post("old", "$AMC earnings", NOW - 86400001), post("future", "$AMC earnings", NOW + 1)] });
  } });
  const result = await load("AMC", "top");
  assert.equal(urls[0].origin, "https://api.bsky.app");
  assert.equal(urls[0].searchParams.get("sort"), "top");
  assert.equal(urls[0].searchParams.get("since"), "2026-10-29T18:00:00.000Z");
  assert.equal(urls[0].searchParams.get("q"), "$AMC");
  assert.equal(texts.length, 2);
  assert.equal(result.total, 2);
  assert.equal(result.positive, 1);
  assert.equal(result.negative, 1);
  assert.equal(result.windowMinutes, 1440);
  assert.deepEqual(result.sample, { sort: "top", examined: 7 });
  assert.ok(!JSON.stringify(result).includes("PRIVATE_"));
  assert.ok(!JSON.stringify(result).includes("did:plc"));
});

test("search caches aggregate results, coalesces reads and separates top from latest", async () => {
  let reads = 0, now = NOW;
  const load = createBlueskySearch({ now: () => now, sentiment: { snapshot, classify: async () => "neutral" }, fetchImpl: async () => { reads++; return Response.json({ posts: [post("one", "$AMC earnings")] }); } });
  await Promise.all([load("AMC", "top"), load("AMC", "top")]);
  await load("AMC", "top"); assert.equal(reads, 1);
  await load("AMC", "latest"); assert.equal(reads, 2);
  now += 60001;
  await load("AMC", "top"); assert.equal(reads, 3);
});

test("search failures and malformed results stay unavailable rather than becoming zero sentiment", async () => {
  for (const fetchImpl of [async () => new Response("PRIVATE_TOKEN", { status: 403 }), async () => Response.json({ posts: null })]) {
    const load = createBlueskySearch({ now: () => NOW, sentiment: { snapshot, classify: async () => "positive" }, fetchImpl });
    await assert.rejects(load("AMC", "top"), /Recent Bluesky sentiment unavailable/);
  }
});

test("disabled or loading models do not fetch posts or reuse live counts as search counts", async () => {
  let reads = 0;
  for (const modelStatus of ["disabled", "loading", "error"]) {
    const load = createBlueskySearch({ now: () => NOW, sentiment: { snapshot: (ticker) => ({ ...snapshot(ticker), enabled: modelStatus !== "disabled", modelStatus }) }, fetchImpl: async () => { reads++; } });
    assert.equal((await load("AMC", "top")).total, 0);
  }
  assert.equal(reads, 0);
});

test("search bounds returned results and classifies at most 25 matching posts", async () => {
  let classified = 0;
  const load = createBlueskySearch({ now: () => NOW, sentiment: { snapshot, classify: async () => { classified++; return "neutral"; } }, fetchImpl: async () => Response.json({ posts: Array.from({ length: 100 }, (_, i) => post(String(i), "$AMC earnings")) }) });
  const result = await load("AMC", "top");
  assert.equal(classified, 25);
  assert.equal(result.total, 25);
  assert.equal(result.sample.examined, 50);
});

test("invalid requests are rejected before fetching and a stalled search has a deadline", async () => {
  let reads = 0;
  const load = createBlueskySearch({ now: () => NOW, timeoutMs: 15, sentiment: { snapshot, classify: async () => "positive" }, fetchImpl: async () => { reads++; return new Promise(() => {}); } });
  await assert.rejects(load("bad!", "top"));
  await assert.rejects(load("AMC", "invalid"));
  assert.equal(reads, 0);
  await assert.rejects(load("AMC", "top"), /Recent Bluesky sentiment unavailable/);
});
