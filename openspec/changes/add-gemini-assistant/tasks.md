# Gemini assistant completion plan

**Goal:** Finish the research assistant with Docker support and repeatable verification.
**Architecture:** Keep the existing web proxy, private Research service, bounded Gemini/MCP loop and Chroma store. Mock mode remains the default without a key.
**Spec:** proposal.md; verification results are recorded in docs/reports/verification-2026-11-06.md.

## Constraints and review focus

- Never expose local keys in deployment files, images, logs or screenshots.
- Preserve paper trading, token isolation, route limits and the existing terminal UI.
- Verify missing-key fallback, public mock mode, knowledge retrieval, invalid commands and offline model assets.

## Tasks

- [x] Reproduce the command failure, replace the obsolete invalid-panel fixture, and run web tests.
- [x] Add a deployment regression check for Gemini key removal and forced mock mode; observe it fail, then fix deploy/up.sh. Inspect AWS config for the same exposure.
- [x] Add Compose Gemini settings and the internal Pumpwatch tool URL; document the local settings in .env.example.
- [x] Run Research pytest, ruff and mock evals; add the eval command to CI.
- [x] Run web lint and production build; fix any confirmed failures.
- [x] Build and start the apps profile; smoke-test stock lookup, paper orders, ASK, knowledge retrieval and sentiment assets.
- [x] Update README and capture a labelled mock ASK screenshot.
- Delivery: final diff reviewed; feature-branch commit, PR and CI status are tracked in GitHub.
- [ ] After integration, prepare Vercel route handlers on a separate branch/PR.

## Progress

- Baseline: worktree clean; command tests reproduce 8 passed / 1 failed because panel 9 is valid.
- Docker engine initially stopped; start Docker Desktop for integration checks.

- Local verification completed: 222 Java, 118 web, 88 Research and 16 ML tests passed. Actual news/social model checks passed with networking disabled; model mistakes and load results are documented under docs/.
