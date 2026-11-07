import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentLabel } from "../text-models.mjs";

test("financial-post model labels map to the public three-label contract", () => {
  assert.equal(sentimentLabel("BULLISH"), "positive");
  assert.equal(sentimentLabel("BEARISH"), "negative");
  assert.equal(sentimentLabel("NEUTRAL"), "neutral");
  for (const input of ["irony", "constructor", "__proto__", undefined, null]) assert.throws(() => sentimentLabel(input), /Invalid sentiment label/);
});
