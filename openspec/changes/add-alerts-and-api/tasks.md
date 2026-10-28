## 1. API

- [x] 1.1 Add the `api` Spring Boot module with a Postgres read layer for scores, timelines and flags
- [x] 1.2 Implement the watchlist, timeline and recent-flags endpoints with event-time aligned series
- [x] 1.3 Implement the SSE flag stream with heartbeats and last-event-id resume
- [x] 1.4 Add rate limiting, origin allow-list and the fixed not-advice notice on every response
- [x] 1.5 Ensure no response includes raw post text or author identifiers, with a test
- [x] 1.6 Add replay isolation by run id with a test that live responses never include replayed flags

## 2. Alerts

- [x] 2.1 Implement the webhook notifier reading URLs from the environment
- [x] 2.2 Add retry with backoff and per-flag, per-webhook de-duplication
- [x] 2.3 Add the cooldown and the digest for bursts
- [x] 2.4 Add the notice and model version to every message
- [x] 2.5 Test that webhook URLs never appear in logs or stored records

## 3. Web

- [ ] 3.1 Add a client component that fetches the API after first paint with a short timeout
- [ ] 3.2 Show live flags and the real ticker timeline when live data exists, labelled live
- [ ] 3.3 Keep the labelled simulation as the fallback and never mix the two in one view
- [ ] 3.4 Proxy `/api` through the web host
- [ ] 3.5 Verify first paint and total JavaScript size did not regress
