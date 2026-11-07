# Local performance and optimization report — November 6, 2026

## Environment and scope

These are local development measurements, not cloud capacity or production SLOs. The load generator and services share an AMD Ryzen 9 6900HS (8 physical cores / 16 logical processors). Docker Desktop 28.3.2 exposes 16 CPUs and 6,213,763,072 bytes of memory to its Linux engine. Builds and Java integration checks also ran on this host, so results include shared-machine contention.

The API database was populated with `load/seed.sql`: synthetic records for 50 tickers, 18,000 scores and 200 flags. No Alpaca credentials or real prices were needed. The API test starts only after its health check succeeds. A first attempt launched during startup was discarded; its connection-refused errors are not included below.

## Fresh measurements

| Test | Configuration | Observed result |
| --- | --- | --- |
| Read API | Direct Spring API at `127.0.0.1:8083`; ramp to 100 VUs over 20s, hold 60s, ramp down 10s | 55,142 requests; 612.6 requests/s |
| Successful read latency | Watchlist, recent flags and GME timeline | p50 116.2ms; p95 322.2ms; actual p99 462.7ms |
| Read errors and throttling | Temporary rate allowance 100,000,000/min; default burst initially retained | 0% non-429 errors; **29 requests throttled with 429**. The error metric excludes 429; total request rate includes them. |
| SSE capacity | Proxy at `127.0.0.1`; 1,000 clients; 10s ramp; 20s hold; temporary global/per-client caps of 1,200 | 1,000 open, 1,000 receiving bytes, 0 dropped, 0 refused |
| Synthetic flag delivery | One synthetic flag inserted after clients connect; API polls every second | 1,000/1,000 delivered; p50 1,315ms; p95 1,755ms; max 1,798ms |
| Default SSE safeguards | Normal configuration restored; 20 clients from one client address; 16s hold | 5 accepted and receiving; 15 refused; all 5 received the synthetic flag; p95 229ms |

The read test met its checked-in successful-response p95 <500ms and non-429 error-rate <1% gates. The 29 throttled requests remain visible; they are not successful responses. The capacity run intentionally raised safeguards and must not be interpreted as the default number of streams allowed to one user. Normal limits were restored afterward.

Raw compact results are in [the report directory](performance/2026-11-06/). Reproduce read traffic with `k6 run load/api.js` after setting `BASE`, `VUS` and `RATE_LIMIT`; reproduce SSE traffic with `node load/stream.mjs` and `BASE`, `CONNS`, `RAMP`, `HOLD`, `INSERT_FLAG`. Use a disposable local database with the seed script. Keep the API private. Record any temporary service-limit overrides separately and restore normal settings after the run.

## Changes and their tradeoffs

### Existing pipeline pane optimization

Commit `0ea2cb5` predates this completion work. Previously each tick updated 144 overlapping event-time windows and repeatedly serialized growing aggregation state. It now folds ticks into one 15-second pane per ticker, then merges completed panes into the 1-, 5- and 30-minute hopping windows. The work per raw tick no longer multiplies across all overlapping windows.

This adds up to 15 seconds before final window output. Records later than the pane end plus the two-minute grace are dropped instead of contributing to longer windows. Those are material event-time tradeoffs, not a free speedup.

Claude's earlier local notes reported 164,508 versus 3,507 processed ticks in roughly two minutes (about 47x), 399,000 Kafka-produced messages/s, and 1.02 million consumed messages/s. **Those stress tests were not rerun here.** The earlier pipeline run emitted zero scores, with watchlist coverage only a suspected cause. Do not quote it as end-to-end scored throughput or as a freshly confirmed gain.

### Changes in this completion

- **Headline inference caching and coalescing:** simultaneous requests for the same news snapshot share one classification run, with a bounded 31-entry cache. Headline requests remain usable if inference fails. Tests verify a repeated/simultaneous read runs the classifier once. No latency improvement percentage is claimed.
- **Bounded social inference:** post sentiment and irony share the existing bounded, serial post queue. Possible irony is counted separately; labels are never inverted. Additional irony inference costs CPU and memory. Both model assets are built into Docker for offline startup.
- **Working native runtime:** replaced the Alpine web base with Debian because ONNX's glibc runtime failed to load under Alpine. The build now executes real inference. This is a compatibility fix, with a larger base image, not a measured throughput optimization.
- **Offline asset loading:** the model registry attempted network metadata requests even after weights were cached. Complete pinned cache directories now load by explicit local path. An incomplete cache falls back to the normal download path. The real-model pipeline is verified with networking disabled rather than assuming a cached download means offline support.
- **Workspace presets:** focused layouts reduce visible clutter. Hidden panels preserve their state; this is a UX change, not evidence of reduced network or server load.
- **Accurate measurement:** k6 now explicitly requests `p(99)` in its trend summary. The former fallback printed the maximum when p99 was absent, so previous values labelled p99 should not be compared with the actual p99 above.

## Limits

There is no apples-to-apples before/after capacity comparison in this run. The earlier 438.8 requests/s result went through a different proxy path; the fresh 612.6 figure targets the Java API directly. It does not establish a code-caused speedup. These tests do not measure cloud networking, paid-provider limits, sustained day-long traffic, or predictive accuracy. See the [sentiment evaluation](sentiment-evaluation-2026-11-06.md) for the model's separate accuracy limitations.
