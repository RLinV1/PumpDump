import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { configuredSourceKeys, validateSourceRegister } from "../../scripts/source-register.mjs";

const root = resolve(import.meta.dirname, "../..");

test("every configured source has a register row", () => {
  const keys = configuredSourceKeys(
    readdirSync(resolve(root, "connectors/src/main/resources"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
      .map((entry) => readFileSync(resolve(root, "connectors/src/main/resources", entry.name), "utf8")),
  );
  const markdown = readFileSync(resolve(root, "docs/data-sources.md"), "utf8");

  assert.ok(keys.length > 0, "connector source configuration must be discovered");
  assert.deepEqual(validateSourceRegister(keys, markdown, new Date().toISOString().slice(0, 10)), []);
  assert.match(
    validateSourceRegister(["missing-source"], markdown, "2026-10-30").join("\n"),
    /missing-source.*no register row/,
  );
});

test("a source verification date older than 90 days fails the register check", () => {
  const markdown = [
    "| Config key | Source | Plan | Limit | Terms link | Last verified |",
    "| --- | --- | --- | --- | --- | --- |",
    "| demo | Demo | free | 1 | https://example.com/terms | 2026-01-01 |",
  ].join("\n");

  assert.match(validateSourceRegister(["demo"], markdown, "2026-10-30").join("\n"), /demo.*stale/);
});
