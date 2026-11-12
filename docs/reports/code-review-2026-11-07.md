# PR 78 CodeRabbit follow-up — November 7, 2026

The original review raised 19 findings. Two were fixed in commit `721177e`; this follow-up addresses the remaining 17. Findings were checked against current code, and nontrivial fixes have regression coverage. Review thread completion is tracked on PR 78.

| Finding | Change and regression coverage |
| --- | --- |
| Social model source title | Assistant cites FinTwitBERT for social sentiment; both sentiment and pump-tool source paths tested. |
| Mock/fallback request lifetime | One monotonic budget covers Gemini, mock startup, tool work and fallback. Blocking mock tools run in an owned spawn process, terminated and joined on timeout. Tests start slow work, consume Gemini budget first, and check that no child remains. |
| Uppercase ticker ambiguity | Question words/company aliases do not become duplicate tickers; explicit cash tags remain valid; ambiguous multi-ticker questions request clarification. Comparisons still work. |
| Risk/technical question routing | Volatility and moving-average questions use their dedicated tools before generic price-move routing. |
| News date attribution | Movement answers call these recent headlines, without claiming publication inside the price window. |
| Untracked ticker score | Only a current watchlist row supplies a current score. A retained flag does not make a ticker currently tracked. |
| Interrupted knowledge rebuild | Build a separate collection, validate completeness, then atomically publish its pointer. A failed build preserves the active library; partial/legacy unmarked builds do not satisfy --if-missing. |
| Historical flag evidence | Current score/window and historical flag score/time/contributors/catalyst stay separate in the tool output and answer. |
| HTTP paper token fallback | Explicit missing/invalid HTTP tokens cannot use a standalone environment account (fixed previously); standalone MCP fallback remains tested. |
| Rejected-client bookkeeping | Globally rejected new clients are not retained in the limiter map (fixed previously). |
| Retained sentiment freshness | A failed refresh shows a warning and the last sample timestamp rather than calling it the current 24-hour sample; a successful refresh clears it. |
| Storage-blocked account continuity | Paper and assistant requests reuse one in-memory token for the page session. |
| Transient headline inference failure | Cache successful classifications only; retries of the same news snapshot can recover and coalesce. |
| Load-test reproduction setting | The performance report states the API service's actual temporary rate override, restart requirement, and the fact that RATE_LIMIT only labels the report. |
| Missing k6 p99 | Save JSON with null p99 and render “unavailable”; never substitute maximum latency. Tests cover both omitted and actual p99. |
| Numeric grounding collisions | Match claimed values to evidence fields and units; unrelated scores do not support sentiment percentages or dollar prices, and only explicit cents fields convert to dollars. |
| Missing required evidence | Every answer is included in grounding; missing calls for tool-required questions fail, while valid no-tool trade refusals still pass. |
| Expected citation validation | A required knowledge source must be both retrieved and cited, not merely mentioned in prose. |
| Company research routing | Business descriptions and company watch-outs use knowledge retrieval; explicit snapshot requests preserve stock lookup. |

## Verification

- Web: **125 tests passed**, lint and production build passed. The final stale-warning wording also passed its focused tests.
- Research: **141 tests passed** in the complete suite on Python 3.13; Ruff passed from `research/` with its actual configuration.
- Mock evaluations: 19 questions and 14 retrieval queries; tool selection, numeric accuracy, grounding and retrieval hit@3 all **1.000**, locally and in the rebuilt Linux container. [Synthetic container results](review/2026-11-07/assistant-evals.json) retain the individual answers and evidence checks.
- Docker: research/web images built and became healthy. HTTP smoke requests selected knowledge, risk and technical tools correctly. The actual FinTwitBERT/Cardiff/financial-news pipelines passed with network disabled.
- Bash syntax passed for the modified load-report runner. Independent review found no material regressions.

The first full Python run passed 140 tests and exposed a rate-limit test that assumed 30 real worker requests would finish within its minute window. The route-limit test now controls only the service's limiter clock, stubs agent cost, verifies no work is forwarded on rejection, and checks recovery after the window. Other tests retain actual subprocess and HTTP integration coverage. The complete rerun passed 141/141. Final lint also caught two test import-group formatting issues, which were corrected.

The cases use synthetic data, local fixtures and fake Gemini clients. No real Gemini request or cloud deployment was performed. GitHub CI and review-thread status are visible on [PR 78](https://github.com/RLinV1/PumpDump/pull/78).

## Operational tradeoffs

Per-request mock process isolation adds process/import startup work in exchange for being able to stop blocking provider work. It does not turn a thread timeout into cancellation. Successful old knowledge collections remain available for readers holding their handles; this change does not delete existing library data. Complete legacy libraries without completion metadata rebuild once on the next --if-missing ingestion.

The deterministic grounding checks are stricter diagnostics, not a proof that arbitrary prose is factually correct. The existing sentiment model accuracy and sarcasm limitations still apply. No new capacity benchmark is claimed by this review patch.
