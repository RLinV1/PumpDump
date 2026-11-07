// Synthetic challenge set, not a representative or independently labelled accuracy benchmark.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NEWS_MODEL, SOCIAL_MODEL, IRONY_MODEL, loadTextClassifier, sentimentLabel } from "../text-models.mjs";
import { MODEL_CACHE_DIR } from "../bluesky-sentiment.mjs";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/sentiment-challenges.json", import.meta.url), "utf8"));
assert.equal(new Set(fixtures.map((item) => item.id)).size, fixtures.length);
const social = process.argv.includes("--social");
const classify = await loadTextClassifier(social ? SOCIAL_MODEL : NEWS_MODEL, MODEL_CACHE_DIR);
const irony = social ? await loadTextClassifier(IRONY_MODEL, MODEL_CACHE_DIR) : null;
const rows = [];
for (const item of fixtures) {
  const [result] = [].concat(await classify(item.text));
  const actual = sentimentLabel(result.label);
  assert.ok(["positive", "negative", "neutral"].includes(actual));
  const ironyResult = irony ? [].concat(await irony(item.text))[0] : null;
  rows.push({ ...item, actual, score: result.score, correct: actual === item.expected,
    ...(ironyResult ? { irony: ironyResult.label === "irony", ironyExpected: item.category === "sarcasm", ironyScore: ironyResult.score } : {}) });
}
const categories = Object.fromEntries([...new Set(rows.map((r) => r.category))].map((name) => {
  const group = rows.filter((r) => r.category === name);
  return [name, { correct: group.filter((r) => r.correct).length, total: group.length }];
}));
const report = { date: new Date().toISOString(), input: "synthetic financial posts", model: social ? SOCIAL_MODEL : "Financial DistilRoBERTa (pinned repository revision)",
  limitation: "Small developer-authored set with intended overall tone labels. Not real-world accuracy; sarcasm and mixed/multiple-ticker tone require human interpretation.",
  correct: rows.filter((r) => r.correct).length, total: rows.length, categories,
  ...(social ? { ironyModel: IRONY_MODEL, ironyCorrect: rows.filter((r) => r.irony === r.ironyExpected).length,
    sarcasmDetected: rows.filter((r) => r.ironyExpected && r.irony).length,
    falseIronyFlags: rows.filter((r) => !r.ironyExpected && r.irony).length } : {}), rows };
const output = process.argv[2] ?? join(tmpdir(), "pumpwatch-sentiment-eval.json");
await writeFile(output, JSON.stringify(report, null, 2));
for (const [name, result] of Object.entries(categories)) console.log(`${name}: ${result.correct}/${result.total}`);
for (const row of rows.filter((r) => !r.correct)) console.log(`MISS ${row.id}: intended=${row.expected} model=${row.actual} score=${row.score.toFixed(3)} | ${row.text}`);
console.log(`Synthetic challenge result: ${report.correct}/${report.total}. Report: ${output}`);
if (social) console.log(`Irony: detected ${report.sarcasmDetected}/6 sarcasm cases; ${report.falseIronyFlags}/40 false flags on other cases. Sentiment labels were not inverted.`);
assert.ok(categories.clear.correct / categories.clear.total >= 0.9, "clear-example regression gate: at least 90% required");
