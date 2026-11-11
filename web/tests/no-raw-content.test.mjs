import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import * as api from "../lib/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const score = { ticker: "GME", score: 74, modelVersion: "rules-v1", windowEnd: "2026-10-28T18:00:00Z", computedAt: "2026-10-28T18:00:01Z", staleSources: [] };
const flag = { id: 7, ticker: "GME", raisedAt: "2026-10-28T18:00:00Z", evidence: { score: 74, modelVersion: "rules-v1", topContributors: [{ featureGroup: "social", delta: 30 }], postCount: 80, tradeCount: 200, catalyst: { found: false, items: [] } } };
const timeline = { ticker: "GME", from: "2026-10-28T12:00:00Z", to: "2026-10-28T18:00:00Z", scores: [{ at: "2026-10-28T18:00:00Z", score: 74, modelVersion: "rules-v1" }], flags: [{ id: 7, at: "2026-10-28T18:00:00Z", score: 74 }] };

const serve = (data) => { globalThis.fetch = async () => Response.json({ notice: api.NOTICE, data }); };

// each case adds a raw-content key at a different depth
const polluted = [
  ["/api/v1/watchlist", [{ ...score, authorHandle: "alice.bsky.social" }]],
  ["/api/v1/watchlist", [{ ...score, text: "raw post" }]],
  ["/api/v1/flags", [{ ...flag, authorId: "did:plc:abc" }]],
  ["/api/v1/flags", [{ ...flag, evidence: { ...flag.evidence, posts: [{ text: "raw post" }] } }]],
  ["/api/v1/tickers/GME/timeline", { ...timeline, scores: [{ ...timeline.scores[0], text: "raw" }] }],
];

for (const [i, [path, data]] of polluted.entries()) {
  test(`rejects raw post text or author keys (case ${i + 1}: ${path})`, async () => {
    serve(data);
    await assert.rejects(api.get(path), /Invalid API data/);
  });
}

test("a flag event with an author field is dropped, a clean one is parsed", () => {
  const event = (f) => JSON.stringify({ notice: api.NOTICE, data: f });
  assert.equal(api.parseFlagEvent(event({ ...flag, authorId: "did:plc:abc" })), null);
  assert.deepEqual(api.parseFlagEvent(event(flag)), flag);
});

test("clean scores, flags and timelines still load", async () => {
  serve([score]);
  assert.deepEqual((await api.get("/api/v1/watchlist")).data, [score]);
  serve([flag]);
  assert.deepEqual((await api.get("/api/v1/flags")).data, [flag]);
  serve(timeline);
  assert.deepEqual((await api.get("/api/v1/tickers/GME/timeline")).data, timeline);
});
