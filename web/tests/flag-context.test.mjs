import assert from "node:assert/strict";
import { test } from "node:test";
import { flagContext } from "../lib/flag-context.ts";

const flag = (evidence) => ({ id: 1, ticker: "GME", raisedAt: "2026-01-01T00:00:00Z", evidence: { modelVersion: "rules-v1", ...evidence } });

test("the flag context is one short line with the score, counts, catalyst and drivers", () => {
  const text = flagContext(flag({ score: 74.4, postCount: 120, tradeCount: 45, catalyst: { found: true, items: ["a", "b"] }, topContributors: [{ featureGroup: "volume", delta: 12.34 }] }));
  assert.equal(text, "GME flag: score 74 of 100 (Pump likely). 120 posts, 45 trades. 2 possible catalyst(s) found, score discounted. Driven by volume (+12.3).");
  assert.equal(flagContext(flag({ score: 20, postCount: 1, tradeCount: 2, catalyst: null, topContributors: [] })), "GME flag: score 20 of 100 (Low risk). 1 posts, 2 trades. catalyst check not run.");
});

test("the flag context never exceeds the server cap or contains control characters", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ featureGroup: `group\n${i}`, delta: 1 }));
  const text = flagContext(flag({ score: 50, postCount: 1, tradeCount: 1, catalyst: null, topContributors: many }));
  assert.ok(text.length <= 600);
  assert.ok(!/[\u0000-\u001f]/.test(text));
});
