# Address PR 78 review findings

Verify each finding against the code, add targeted regressions, preserve existing feature behavior, then run full web/research checks and the mock evaluation gate. Update the existing feature PR; do not merge.

- [x] Keep anonymous HTTP paper tokens separate from standalone MCP environment fallback (previous commit).
- [x] Do not retain globally rejected rate-limit clients (previous commit).
- [x] Correct FinTwitBERT source attribution.
- [x] Bound mock and fallback tool execution by one request deadline; terminate timed-out work.
- [x] Disambiguate uppercase words and tickers.
- [x] Route risk/technical metric questions before price-move questions.
- [x] Describe unrelated-date news as recent headlines.
- [x] Do not present untracked ticker historical scores as current.
- [x] Preserve the active knowledge library until its rebuild succeeds; detect incomplete stores.
- [x] Keep current risk scores separate from historical flag evidence.
- [x] Label retained sentiment stale after refresh failure.
- [x] Share paper account token in memory when storage is blocked.
- [x] Retry failed news sentiment rather than caching errors.
- [x] Document the actual API service rate override for reproducing load results.
- [x] Preserve k6 report output when p99 is absent.
- [x] Match grounding figures to evidence fields and units.
- [x] Fail grounding for tool-required answers with missing evidence.
- [x] Require expected knowledge source to be both retrieved and cited.
- [x] Route company research questions to knowledge while preserving snapshot requests.
- [x] Run integrated local verification and independent review.

Delivery: update PR 78 and resolve each addressed review thread after validation. GitHub CI and thread state are authoritative for delivery status.
