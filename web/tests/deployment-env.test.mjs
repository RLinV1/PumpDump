import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("public VM environment strips Gemini credentials and forces the mock agent", () => {
  const script = readFileSync(new URL("../../deploy/up.sh", import.meta.url), "utf8");
  // Execute the actual export block with synthetic values; SSH never runs.
  const block = script.slice(script.indexOf("{ grep"), script.indexOf(' | ssh "$SSH"', script.indexOf("{ grep")));
  assert.ok(block.startsWith("{ grep"));
  const fixture = "GEMINI_API_KEY=synthetic-secret\nGEMINI_MODEL=local-model\n export GEMINI_API_KEY = synthetic-secret\n  GEMINI_MODEL = local-model\nUSE_MOCK_LLM=0\n export USE_MOCK_LLM = 0\nDATA_MODE=live\nPLUTUS_USE_MOCK_DATA=0\nPOSTGRES_USER=pumpwatch\n";
  const result = spawnSync(process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash",
    ["-c", block.replace(".env;", '<(printf "%s" "$TEST_ENV");')],
    { encoding: "utf8", env: { ...process.env, TEST_ENV: fixture, DEPLOY_DATA_MODE: "mock" } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /GEMINI_|synthetic-secret/);
  assert.match(result.stdout, /^USE_MOCK_LLM=1$/m);
  assert.doesNotMatch(result.stdout, /USE_MOCK_LLM\s*=\s*0/);
  assert.match(result.stdout, /^PLUTUS_USE_MOCK_DATA=1$/m);
  assert.match(result.stdout, /^POSTGRES_USER=pumpwatch$/m);
});
