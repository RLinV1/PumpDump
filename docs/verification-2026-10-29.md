# Local verification

The repository default is `DATA_MODE=mock`. Mock data works without credentials, Docker or a running API.
On 2026-10-29 the operator supplied credentials and requested the local switch to `DATA_MODE=live` with
`ALPACA_ENABLED=true`. Live mode routes exclusively to the real API; it does not substitute mock records.
Authenticated Alpaca IEX REST reads returned HTTP 200 for the three watchlist symbols, and a real-time
trade subscription authenticated and received 30 trades in the short preflight check. No orders or
account operations were used. Root/nested `.env` files and backups are ignored by Git and Docker; only
the blank `.env.example` template is tracked, and neither credential was found in tracked files.

## Web

- 25 Node tests passed: snapshot success/quiet/empty/failure/timeout/cancellation, event-time ordering,
  public-response validation, mode propagation and isolation, mock HTTP/SSE contracts, forwarding-header
  sanitization and normalized paths. Local HTTP tests require execution outside the network sandbox.
- ESLint and TypeScript passed. Production webpack build passed with Tailwind utilities generated.
- Mock mode: desktop (1440px) and mobile (390px) passed landing-to-watchlist navigation, ticker selection,
  score history, explicit mock notices, streaming flags, privacy and horizontal-overflow checks.
- Live proxy: both sizes passed populated, quiet, empty, unavailable, ten-second-stalled and malformed
  upstream scenarios. These are controlled contract checks, not a claim of actual market connectivity.
- Raw `/x/../api/...` and encoded-dot HTTP requests stay inside mock mode.
- API requests begin after first contentful paint. Final measured mock FCP was 468ms desktop and 160ms mobile;
  first API requests began at 488ms and 343ms respectively. Local samples are not production guarantees.
- Removed unused Motion dependency and reused GSAP. Decoded fallback JavaScript decreased from 757,409 to
  621,659 bytes (17.9%); the populated panel used 653,771 bytes. Counts include scripts observed in local
  browser resource timing, rather than network-compressed transfer size.
- Scroll-grid positions remained 0/-35/-70/-70px at scroll offsets 0/350/700/1000px. Changing to reduced motion
  restores zero translation.

## Python

All 16 existing ML tests passed with the repository's pinned requirements. Dependencies and test output
were kept in ignored workspace tooling folders.

## Java and independent review

The full initial Java reactor passed, including all 67 pipeline tests. Subsequent affected-module
verification (`connectors,replay,api` plus `common`) passed, including the real HTTP trusted/untrusted
proxy regression and the new Spring-managed Bluesky start/stop regression. Eleven Docker-dependent
tests were reported skipped, including the unexpanded shared-schema parameterized test class.

The shared-schema regression reproduced the original missing-table failure in all six startup orders
before `baseline-version: 0` was added to the three independent Flyway configurations. Its green run was
initially blocked by Docker Desktop crashing during engine startup (Inference manager cannot remove its runtime
file); no factory reset, socket removal or Docker configuration changes were attempted. The source
connectors remain disabled until the operator supplies keys and completes source verification.

Three subagents independently reviewed correctness/security, performance and backend readiness. Findings
were fixed and checked again. No external feed, deployment, webhook delivery or cloud resources were used
for mock verification.

## Focused dashboard follow-up

Applied Superpowers' reproduction/verification workflow, Ponytail's small-change rules, Impeccable's
existing-design and craft guidance, and the published
[Karpathy guidelines](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md)
and [Taste guide](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md).
Karpathy and Taste were read from their source repositories. Impeccable's context helper could not download
its engine, so existing project context and direct browser audits were used; no native Taste inspector
result is claimed.

Verified and fixed:

- Streamed flags were hidden while the initial flag-history fetch remained pending. The reproduced
  browser case now displays stream data immediately without waiting for history.
- The dashboard sorted by insertion id; both surfaces now share event-time ordering. A late older
  flag stays behind the newer event in unit and browser tests.
- Malformed stream JSON or invalid evidence is ignored through the same validation used by snapshots.
  The browser handles invalid messages followed by valid flags without a page error.
- The dashboard now has a level-one heading, and its home/ticker controls measure at least 44px tall
  (ticker controls also at least 44px wide). Keyboard ticker selection passed.
- Loading placeholders have valid status semantics. A stalled-API accessibility check passed.
- A port collision reports a clear startup error and exits with status 1 rather than leaving a dead
  preview process running. The final mock preview remained healthy after this check.
- Dashboard requests validate every public response before rendering; malformed watchlists, evidence,
  scores and timelines cannot crash the view. Valid zero scores and empty history remain usable.
- A caller's cancellation signal no longer disables the request deadline. Conflicting mock/live labels
  are rejected instead of displaying mock values as live.
- Flag history refreshes on stream connection and reconnection, recovering missed records without an
  hourly wait. Repeated reconnects coalesce behind a pending history read instead of overlapping or
  continually aborting it. Failed reads retry after five seconds even if the stream stays connected.
- The landing score and flag show their age beside the clock time; a 72-hour-old score is visibly old.

The final six-case browser recovery check passed: startup failure, reconnect gap, repeatedly disconnecting
stream with slow history, REST recovery with a stable stream, malformed watchlist and old score timestamp.
An additional independent reviewer reproduced the stable-stream failure before the fix and confirmed
recovery afterward, with no remaining actionable findings in the reviewed recovery changes.

Final axe checks reported no violations for the tested WCAG 2 A/AA, WCAG 2.1 AA and best-practice rules
at 1440x1000, 768x1024, 390x844 and 844x390. No horizontal overflow or undersized dashboard controls were
measured. Screenshots at all four sizes were inspected. These are automated/local checks, not a claim
of complete accessibility certification.

## Actual live activation

Docker Desktop subsequently started normally without a reset or configuration change. Kafka, Postgres,
connectors, replay, pipeline and API are all running healthy. Only the Alpaca market-data connector is
enabled. Its authenticated IEX subscription feeds real trades to Kafka, the rules pipeline produces
scores for AMC, GME and SNDL, and the web proxy returns HTTP 200 with the live-mode header.

Starting the complete applications exposed and fixed three production startup problems:

- Spring could not select SseHub's production constructor. Explicit injection now resolves it; a real
  Spring-context regression reproduced the failure and then passed.
- Pipeline configuration injected its StreamsBuilder while its own configuration was still being
  created. Registering the topology as a bean removes that circular dependency.
- Kafka's default 10-second transaction timeout was below the configured 15-second commit interval.
  The producer transaction timeout is now 60 seconds. A startup regression loads the actual YAML and
  validates the real Kafka producer configuration; it passed after the change.

Full `mvn -B verify` passed 218 tests with zero failures, errors or skips: common 11, connectors 80,
replay 17, pipeline 68 and API 42. This includes the formerly blocked Docker regressions and all six
shared-schema migration orders. The final pipeline configuration delta also passed its targeted startup
test. Replay test teardown emitted a Surefire forced-shutdown warning after its test broker was removed;
the assertions passed. All final live service health checks passed.

Actual-provider browser checks passed at 1440px and 390px: live watchlist, ticker selection, real score
history, open SSE stream and live landing snapshot, without mock labels, horizontal overflow or page
errors. Screenshots were inspected. No real flags were invented for this check; the current quiet feed
shows no flags. Git tracks only the blank environment template, and neither Alpaca credential appeared
in tracked files or the 35 scanned public web assets.
