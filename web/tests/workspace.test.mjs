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
  assert.deepEqual(revealPanel(single, "assistant").panels, ["chart", "assistant"]);
  assert.deepEqual(revealPanel(single, "chart"), single);
  assert.deepEqual(parseWorkspace(JSON.stringify(custom)), custom);
});
