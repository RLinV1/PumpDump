import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { NOTICE } from "../lib/api.ts";

test("the shared notice states not-advice and non-commercial status", () => {
  assert.match(NOTICE, /Not investment advice/);
  assert.match(NOTICE, /non-commercial/);
});

const web = resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(resolve(web, p), "utf8");

test("landing page states the non-commercial status and the not-advice notice", () => {
  const page = read("app/page.tsx");
  assert.match(page, /Not investment advice/);
  assert.match(page, /non-commercial/);
});

test("every surface that shows a score renders the shared notice", () => {
  for (const f of ["components/detector.tsx", "components/live-view.tsx", "components/live-market.tsx", "components/assistant-panel.tsx"]) {
    assert.match(read(f), /\{(?:w\.notice \?\? )?NOTICE\}|state\.notice/, f);
  }
});
