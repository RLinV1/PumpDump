# Verification — November 6, 2026

## Automated checks

| Check | Result |
| --- | --- |
| `mvn -B verify` | **222 tests, 0 failures, 0 errors, 0 skipped** across common, connectors, replay, pipeline and API. Docker-backed Kafka/PostgreSQL tests included. Local JDK 24 compiles the repository's Java 21 target; CI uses JDK 21. |
| Web `npm test` | **119 passed, 0 failed**. Includes HTTP validation, forwarding headers, rate limits, command grammar, watchlists, workspace presets/order, news inference caching/fallback, source filtering, deduplication, deletion, timeouts and separate irony counts. |
| Web `npm run lint` / `npm run build` | Passed; production Next build and TypeScript completed. |
| Research `python -m pytest -o addopts='' -q` | **89 passed** on Python 3.13. Covers lookup, atomic paper orders, token isolation, agent/MCP tools, bounded model loop, service concurrency, RAG retrieval and the two review regressions. |
| Research `ruff check .` | Passed from `research/`, matching CI configuration. |
| Research dependency license gate | Passed, including transitive dependencies. |
| Offline ML pytest | **16 passed** on Python 3.12 initially and again on Python 3.13 in the combined CI dependency environment. |
| Assistant mock evaluations | 19 questions plus 14 retrieval queries. Tool selection, numeric accuracy, groundedness and retrieval hit@3 all 1.000; threshold gate passed. |
| Actual text-model pipelines | Real ONNX weights on synthetic inputs; positive/neutral/negative counts, stream/top/latest, deduplication, off-topic filtering, disabled collection, and separate financial-news inference passed. Explicit network-disabled execution verified bundled assets. |
| Confusing-post diagnostics | 46 synthetic examples evaluated against both sentiment models and the separate irony model. **Errors retained**, with full predictions and caveats in the [evaluation report](../ml/sentiment-evaluation-2026-11-06.md). |
| Local load tests | 100-VU read test, 1,000-client flag delivery and restored default-limit behavior; see [results and conditions](performance-2026-11-06.md). |

The four main automated suites total **446 tests**. Passing software checks do not establish perfect model interpretation or predictive performance.

## CI organization and service naming

Feature branches run CI on pull requests, avoiding duplicate push and PR runs. Push checks remain enabled for `main`, and newer commits cancel superseded runs for the same PR. Four checks remain: Backend (Java tests and Maven licenses), Web (tests, lint, build, real-model offline checks and npm licenses), Python (offline ML, research service, RAG/evals and both Python license scans), and Infrastructure (Terraform format/validation without a backend).

The Python service now lives in `research/`, uses the `research` Docker service and `researchpaper` volume, and reads `RESEARCH_*` settings. Web routing, deployment scripts and optional AWS configuration use the same names. Existing paper data was copied to the new volume with matching database SHA256 checksums; the original volume was retained for recovery. No Terraform apply or cloud resource creation was performed.

## Browser workflows

Production UI checked at desktop 1440×900 and mobile 390×844:

- Default, Monitor, Research and Trading presets.
- Show/hide panels, reorder them, reload and confirm saved DOM/visual order.
- Prevent hiding the final panel; Restore default recovers the six-panel layout.
- ASK opens a previously hidden panel and preserves the rest of the workspace.
- Add/remove AAPL in the personal watchlist; untracked stocks remain unscored.
- LOOK GME, simulated BUY 10 / SELL 5, position marks and order history.
- Invalid negative order quantity rejected with usage text.
- Pump-risk answer and knowledge answer with retrieved Markdown citations.
- Command help, mobile stacking and no document-level horizontal overflow.
- Refreshed mock screenshots for every feature group; no keys or actual market data in README images.

## Failures investigated and corrected

The old invalid-command fixture used panel 9, which is now ASK. Public deployment filtering kept Gemini settings; the executable regression uses synthetic keys, whitespace and `export` variants. The Alpine image could not load ONNX's glibc binary; Debian resolves that compatibility issue. The cached-model loader still attempted network metadata calls; complete pinned asset directories now load locally. Mock RAG evaluation initially had no seeded store; CI now builds it before the gate.

External review also reproduced an account-token isolation issue and unbounded bookkeeping for globally rejected assistant clients. Explicitly anonymous HTTP requests now cannot fall back to a configured standalone MCP paper account; rejected clients do not enter the rate-limit map. Both have regressions that failed before the fixes.

Independent review found two additional defects: insufficient price history could crash movement explanations, and live paper holdings without marks could be presented as current total/P&L. Both have regression tests; unavailable valuation is now explicit. The ML package's claimed Python >=3.11 range conflicted with pinned NumPy; it now correctly requires >=3.12.

The service rename exposed two missing-origin HTTP fixtures that accidentally used their default hostname; they now explicitly pass an empty origin. Windows also allocated fetch-forbidden IRC ports for HTTP fixtures using `listen(0)`, leaving failed tests open. A shared fixture now selects ports in the dynamic/private range and retries address collisions; all 118 web tests pass. Renamed Docker routing passed lookup, paper-account and assistant requests, and the actual-model offline check and mock evaluation gate passed again.

An initial replay integration run timed out. The unchanged test passed in isolation and then passed as part of the full green Maven verification; its assertions and timeout were not weakened. An initial load attempt started before API readiness and was discarded. Recorded load results come from a health-gated rerun.

## Remaining limits and next work

No real Gemini request was made without the owner's key; the Gemini loop is exercised with fake clients and mock fallback. No cloud resources were provisioned or public model images published. Cardiff irony weight redistribution terms still need verification before publishing images containing those weights. The Vercel route migration remains a separate follow-up PR, as required by the handoff.

The no-mistakes CLI is not installed on this machine; these are the repository's direct checks and recorded browser/inference runs, not a claimed execution of that external gate. GitHub CI remains the final PR check.

## November 7 review follow-up

All 19 original CodeRabbit findings are covered in the [review ledger and verification report](code-review-2026-11-07.md). The follow-up passed 125 web tests and 141 research tests, full lint/build, container smoke tests, offline model inference and the stricter mock evaluation gate. These supplement the November 6 measurements above; no new capacity benchmark is claimed.
