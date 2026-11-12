import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("public VM environment strips credentials and live switches and forces mock data", () => {
  // Runs the real deploy/vm-env.sh (what deploy/up.sh sends to the VM) on synthetic values; SSH never runs.
  const script = fileURLToPath(new URL("../../deploy/vm-env.sh", import.meta.url));
  const fixture = "GEMINI_API_KEY=synthetic-secret\nGEMINI_MODEL=local-model\n export GEMINI_API_KEY = synthetic-secret\nUSE_MOCK_LLM=0\n"
    + " export USE_MOCK_LLM = 0\nDATA_MODE=live\nRESEARCH_USE_MOCK_DATA=0\nBLUESKY_ENABLED=true\nSEC_USER_AGENT=someone@example.com\n"
    + "ALERTS_WEBHOOK_URLS=https://hooks.example.com/x\nPOSTGRES_USER=pumpwatch\n";
  const result = spawnSync(process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash", [script],
    { encoding: "utf8", input: fixture, env: { ...process.env, DEPLOY_DATA_MODE: "mock" } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /GEMINI_|synthetic-secret|someone@example\.com|hooks\.example\.com/);
  assert.match(result.stdout, /^USE_MOCK_LLM=1$/m);
  assert.doesNotMatch(result.stdout, /USE_MOCK_LLM\s*=\s*0/);
  assert.match(result.stdout, /^RESEARCH_USE_MOCK_DATA=1$/m);
  assert.match(result.stdout, /^DATA_MODE=mock$/m);
  assert.match(result.stdout, /^BLUESKY_ENABLED=false$/m);
  assert.doesNotMatch(result.stdout, /BLUESKY_ENABLED=true/);
  assert.match(result.stdout, /^POSTGRES_USER=pumpwatch$/m);
});
