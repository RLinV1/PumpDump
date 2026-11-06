# Security review

Scope: the app as it will run on one public Google Cloud VM, plain HTTP on port 80, behind Caddy. Rated as a personal, non-commercial, read-only public-data app with no accounts and no user data. Reviewed against `main` at 22e806b.

## Summary

No secrets in the tree or the git history. All SQL is parameterised. No route writes data. The real problems were availability ones: one visitor could fill the whole live stream pool, and behind Caddy every visitor would share one rate-limit bucket. Both are fixed or documented below. The Spring Boot parent was eleven patch releases behind and is now on the latest 3.5 patch.

Three issues sit in files this review was told not to edit. They are listed as open items for their owners, and one of them (the web image) matters for launch.

## Findings

### Medium

**M1. One client can use every live stream slot (fixed).**
`SseHub.subscribe` only checked the global `api.max-streams` (100). The rate limiter allows a 30 request burst and 120 per minute, and each stream lives up to 30 minutes, so one script fills all 100 slots in under a minute. Every other visitor then gets 503 on `/api/v1/flags/stream`, and the poller does one Postgres query per second per stream.
Fix: at most 5 streams per client key (`SseHub.MAX_STREAMS_PER_CLIENT`), counted under a lock so concurrent opens cannot overshoot. Tests: `SseHubTest.oneClientCannotTakeEverySlot`.

**M2. Every visitor shares one rate-limit bucket behind Caddy (fixed in the template, needs a check on the VM).**
Caddy sends `/api/*` straight to `api:8083`. The API only trusts forwarding headers from loopback by default (`server.tomcat.remoteip.internal-proxies`), so the peer address it sees is Caddy's Docker address for everyone. All visitors then share 120 requests a minute and one stream quota, so one visitor can lock out the rest, and the per-client stream cap above would count everyone as one client.
Fix: `.env.example` now defaults `API_TRUSTED_PROXIES` to loopback plus the Docker private range `172.16.0.0/12`. Caddy overwrites any `X-Forwarded-For` sent by an untrusted client, and Tomcat takes the right-most untrusted hop, so a caller cannot spoof it (already covered by `ProxyRateLimitTest`). Anyone who copied an older `.env` must update the line. After deploy, check `/api/v1/watchlist` from two different networks and confirm they do not share a 429.

**M3. Web image does not run the hardened server (open, `web/Dockerfile`, not edited).**
`web/Dockerfile` ends with `CMD ["node", "server.js"]` on the Next `standalone` output. The project's own `web/server.mjs` is not copied into the image, so in the container: the forwarding-header sanitising, the security headers added here, the live context routes (`/api/v1/news`, `/api/v1/market-movers`, `/api/v1/tickers/{t}/news|sentiment`) and `DATA_MODE` handling are all absent. Caddy also sends every `/api/*` request to the API, which does not serve the context routes, so they would return 404 even if the image were fixed. Security effect: the headers and the keys-stay-server-side design are only in force when `server.mjs` runs. Owner of the Dockerfile and Caddyfile should either run `server.mjs` in the image (copy it and its helpers, `node server.mjs`) and route the context paths to `web:3000` before the generic `/api/*` rule, or accept that those panels are off.

### Low

**L1. IPv6 clients could mint unlimited rate-limit buckets (fixed).**
The limiter keyed on the full remote address. One IPv6 host usually owns a /64, so it could rotate addresses to dodge the limit and push the bucket map past 10,000 entries, which resets everyone's bucket. Fix: IPv6 addresses are keyed by /64 (`RateLimitFilter.clientKey`, also used for the stream cap). Test: `RateLimitTest.ipv6AddressesInOneSlash64ShareABucket`.

**L2. Outdated dependencies with published advisories (fixed).**
Checked the 67 runtime Maven artifacts against OSV (OSS Index needs an account, so it was not used). Spring Boot 3.5.5 pulled Tomcat 10.1.44, Spring 6.2.10, Jackson 2.19.2, Kafka clients 3.9.1, PostgreSQL JDBC 42.7.7 and others, with advisories on most. The API serves untrusted HTTP through Tomcat and Spring MVC, so these are reachable. Fix: parent bumped to Spring Boot 3.5.16 (same minor line, managed versions move together). `mvn -B verify` passes. Not every advisory is reachable in this app; none were individually triaged. Re-running the OSV query after the bump still lists advisories on 8 artifacts (Tomcat 10.1.55, Jackson 2.21.4, spring-webmvc 6.2.19, PostgreSQL 42.7.11, lz4-java, snappy-java, log4j-api, all at the newest version Boot 3.5.16 manages). OSV matches by package name, so these were not triaged for a fixed version or reachability; further upgrades would mean leaving the Boot 3.5 line, which is not justified for this app.

**L3. No security headers on web or API responses (fixed in code, see M3 for the image).**
API now sends `X-Content-Type-Options: nosniff` (test: `RateLimitTest.responsesAreNotSniffable`). `server.mjs` now sends `nosniff`, `Referrer-Policy`, `Permissions-Policy` and a CSP limited to `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (test: `web/tests/server-headers.test.mjs`). A script-restricting CSP was not added because Next injects inline scripts, and HSTS is pointless over plain HTTP. `X-Powered-By: Next.js` is still sent; setting `poweredByHeader: false` is a one-line change in `web/next.config.ts` (not edited).

**L4. Shared global budget on paid or limited upstream calls (accepted).**
The unauthenticated context routes call Alpaca (news, movers) and Bluesky search, and may run the local sentiment model. They are protected by validation (`^[A-Z]{1,5}$`, fixed `sample` values), shared 30 to 60 second caches, in-flight de-duplication, small LRU caches (31 and 64 keys), global per-minute caps (90 Alpaca news, 30 Bluesky search), short timeouts and a bounded inference queue (64). Ticker input never reaches a URL unencoded or a different host. So a visitor cannot run up a bill or reach another host. The cost: one visitor can use up the global budget and make the panels show "unavailable" for everyone for up to a minute, and the sentiment model can keep one CPU core busy (single serial queue). Accepted for a hobby app; Alpaca's free plan has no per-call cost.

**L5. Slow SSE reader can stall the shared poller (accepted).**
`SseHub.tick` writes to every client on one scheduler thread, so a client that stops reading can delay others until Tomcat's write timeout. Bounded by the 100 stream cap and now the 5 per client cap. A fan-out redesign is out of scope.

**L6. Rate-limiter eviction is crude (accepted).**
At 10,000 distinct keys the whole map is cleared, which hands every client one fresh burst. Reaching 10,000 keys now needs 10,000 distinct IPv4 addresses or /64s. Already marked as a shortcut in the code.

### Info and not-findings

- **Public routes, API:** `GET /api/v1/watchlist`, `/tickers/{ticker}/timeline`, `/flags`, `/flags/stream`. Ticker must match `[A-Z]{1,5}`, `runId` must match `[A-Za-z0-9-]{1,64}`, `limit` is 1 to 100, time span at most 48 hours. Bad input gets a fixed message (`ApiController.badRequest`), never an exception string. Other exceptions use Spring's default error body (no stack trace or message in Boot 3). Non-GET methods get 405.
- **Actuator:** only `health` is exposed on all four apps, details hidden by default. Caddy forwards only `/api/*` to the API and everything else to web, so `/actuator` is not reachable from outside.
- **Public routes, web (`server.mjs`):** the five context routes above, plus Next pages. Only GET, `runId` rejected, unknown sub-paths fall through to Next and 404. `isApiRequest` normalises the path so `/x/../api` cannot dodge the mock-mode boundary (tested). No open proxy: the Next rewrite destination is the fixed `API_ORIGIN`, the caller only supplies a path suffix.
- **Forwarding headers:** `sanitizeForwardingHeaders` overwrites `X-Forwarded-*` from the socket. Right against spoofing; the side effect is that when `server.mjs` sits behind Caddy the API sees Caddy's address. Not an issue for the current layout because Caddy sends `/api` directly to the API.
- **CORS:** `WebConfig` allows GET only and only `API_ALLOWED_ORIGINS`; empty means none. The deployed UI is same-origin, so no CORS is needed. The `https://pumpwatch.example` placeholder in `.env.example` is harmless but can be removed.
- **Keys in browsers:** no `NEXT_PUBLIC_*` variables exist. Alpaca keys are read in `server.mjs` and used only in server-side fetches; responses are reduced to headlines, links and numbers (`publicArticle`) and never echo upstream bodies or headers.
- **Alert webhooks:** URLs come only from `ALERTS_WEBHOOK_URLS` (operator config), so there is no user-controlled SSRF. They are never logged (`AlertService` logs channel names, `AlertProperties.toString` prints a count, error strings are exception class names). Alerts are off by default.
- **SQL:** every statement in `ReadRepository`, `JdbcAlertStore`, the connectors and replay uses `?` placeholders; the only string concatenation is a fixed column text. Alpaca history URLs URL-encode their parameters.
- **Secrets:** working tree and all 70 commits across all refs scanned with regexes for AWS, GitHub, Slack, Discord and Slack webhook, Google, private-key blocks and `KEY/SECRET/TOKEN/PASSWORD=` assignments. No hits. No `.env`, `.pem`, `.tfstate` or `.tfvars` was ever committed. `gitleaks` is not installed here, so this is a pattern scan, not a gitleaks run.
- **Default Postgres password:** `pumpwatch/pumpwatch` is the default in `docker-compose.yml` and `application.yml`. Postgres is bound to `127.0.0.1` only and the VM firewall opens only 80 (and 22 to the operator CIDR), so it is not reachable from outside. Still, set `POSTGRES_PASSWORD` in the VM `.env` (open item for the deploy docs; compose and `deploy/` not edited).
- **Compose exposure:** the five host ports (Kafka 9092, Postgres 5432, 8080 to 8083) are bound to `127.0.0.1`. Only the proxy publishes on `PROXY_BIND:PROXY_PORT`, which `deploy/up.sh` sets to `0.0.0.0:80`. `web` publishes nothing. Confirmed by reading only; compose was not run. Kafka runs PLAINTEXT with no auth, safe only because it is not published outside loopback.
- **Containers:** root `Dockerfile` creates and switches to a non-root user (uid 10001). `web/Dockerfile` ends with `USER node` (non-root). Base images use floating tags (`node:20-alpine`, `eclipse-temurin:21-jre`, `caddy:2-alpine`); pinning is nice to have.
- **CI:** `.github/workflows/ci.yml` sets `permissions: contents: read` and `persist-credentials: false`, and has no secrets or `pull_request_target`. Actions are pinned to major tags (`actions/checkout@v4`, etc.), not commit SHAs; accepted for first-party actions on a personal repo. Node is 22 in the `web` job and 20 in `licenses` and the web image; harmless.
- **Dependencies, web:** `npm audit --omit=dev` found 0 vulnerabilities.
- **Dependencies, Python:** `pip-audit -r ml/requirements.txt --no-deps` found no known vulnerabilities.
- **License gate:** no new dependencies were added, only a version bump of the Spring Boot parent; `scripts/license-gate.sh` was not changed.

## Not checked

- Live behaviour on the VM: Caddy header handling, the actual Docker subnet (the `172.16.0.0/12` default assumes the default bridge ranges), and whether the web image really serves what is expected.
- Terraform, `deploy/`, `load/` and `docs/deploy-gcp.md` were only skimmed for ports and secrets, not reviewed.
- Individual reachability of each Maven advisory; the transformers model download (Hugging Face, pinned by revision) and its supply chain; `npm` transitive install scripts.
- A gitleaks or trufflehog run (not installed), so unusual secret formats could be missed.
- Load or DoS testing beyond reading the limits.
- The Docker images were not built or scanned.
