import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESETS, parseWorkspace, togglePanel, movePanel, revealPanel } from "../lib/workspace.ts";

test("default and focused presets contain valid unique panels", () => {
  assert.equal(PRESETS.default.panels.length, 6);
  assert.deepEqual(PRESETS.monitor.panels, ["watchlist", "chart", "flags"]);
  for (const preset of Object.values(PRESETS)) {
    assert.deepEqual(parseWorkspace(JSON.stringify(preset)), preset);
    assert.equal(new Set(preset.panels).size, preset.panels.length);
  }
});

test("invalid saved layouts recover to default", () => {
  for (const raw of [null, "broken", "{}", '{"name":"custom","panels":[]}', '{"name":"custom","panels":["unknown"]}', '{"name":"custom","panels":["chart","chart"]}']) {
    assert.deepEqual(parseWorkspace(raw), PRESETS.default);
  }
});

test("custom layouts preserve order, keep at least one panel and can reveal commands", () => {
  const custom = togglePanel(PRESETS.monitor, "news");
  assert.equal(custom.name, "custom");
  assert.deepEqual(movePanel(custom, "news", -1).panels, ["watchlist", "chart", "news", "flags"]);
  assert.deepEqual(movePanel(custom, "watchlist", -1), custom);
  const single = { name: "custom", panels: ["chart"] };
  assert.deepEqual(togglePanel(single, "chart"), single);
  assert.deepEqual(revealPanel(single, "news").panels, ["chart", "news"]);
  assert.deepEqual(revealPanel(single, "chart"), single);
  assert.deepEqual(parseWorkspace(JSON.stringify(custom)), custom);
});

test("layouts that list retired panel ids drop those ids", () => {
  const old = (name, panels) => JSON.stringify({ name, panels });
  assert.deepEqual(parseWorkspace(old("custom", ["chart", "retired", "assistant", "news"])), { name: "custom", panels: ["chart", "news"] });
  assert.deepEqual(parseWorkspace(old("research", ["lookup", "assistant", "news", "sentiment"])), PRESETS.research);
  assert.deepEqual(parseWorkspace(old("custom", ["retired", "assistant"])), PRESETS.default); // nothing left: fall back
  for (const preset of Object.values(PRESETS)) assert.ok(!preset.panels.includes("assistant"));
});
