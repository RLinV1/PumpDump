# Design

## Context

The stack is Kafka, Postgres, four Spring Boot services and a Next.js web app. Compose already runs everything but the web app. The API listens on 8083, allows listed browser origins and rate limits per client. The web app reads `NEXT_PUBLIC_API_URL` at build time and opens an SSE stream at `/api/v1/flags/stream`. Supersedes `add-ec2-smoke-deployment`.

## Goals / Non-Goals

**Goals:**
- Same containers as the laptop, one VM, cheap, easy to destroy.
- One public port; web and API share an origin.
- Load numbers that are repeatable and honest about the setup.

**Non-Goals:**
- High availability, autoscaling, TLS and a domain (follow-up), production claims.

## Decisions

**One Compute Engine VM running compose.** Kafka needs a stateful broker and the services share a network; Cloud Run does not fit. An `e2-standard-2` (8 GB) gives headroom for Kafka, Postgres and four JVMs; `e2-medium` (4 GB) is too tight. Rejected: GKE (cost, setup), Managed Kafka (cost).

**Caddy as the proxy.** One small image, two routes, no config language to learn. The live stream goes straight to the API with `flush_interval -1`; everything else goes to the web server, which owns news, movers and sentiment. Next compression stays off because it buffers SSE; Caddy compresses pages. Rejected: nginx (more tuning for SSE), a cloud load balancer (cost).

**Same origin by default.** The web client already calls relative `/api/...` paths, so the proxy only has to route them. No CORS needed in this deployment.

**Next.js standalone output.** `output: "standalone"` gives a small runtime image with no `node_modules` copy.

**Terraform with plain google provider.** One VM, one static address, firewall rules, one budget. Startup script installs Docker and clones nothing: the operator copies the repo archive and `.env` over SSH after boot, so secrets never enter state. Budget alarm is optional-by-variable because it needs a billing account id.

**k6 for the read API, real clients for the stream.** k6 gives thresholds and percentiles for request/response load. k6 buffers response bodies, so it cannot tell a live stream from a stalled one; its first stream test reported 1,000 held connections while no events were arriving. `load/stream.mjs` uses real SSE clients and counts only clients that receive bytes. Alternatives: Gatling and JMeter (heavier), Locust (Python, weaker SSE).

**Honest numbers.** Load tests run from a separate machine against the VM public address (or locally for a baseline). The summary records the VM size, VU count and rate limit so a quoted number can be reproduced. The API rate limit is raised for the run via `API_RATE_LIMIT_PER_MINUTE`.

## Risks / Trade-offs

- [A forgotten VM keeps billing] → Budget alarm, destroy documented as the last step.
- [Load from a laptop measures the laptop link] → Runbook recommends running k6 from a second small VM or Cloud Shell and states the origin in the summary.
- [Rate limit hides capacity] → Run twice: default limit to show protection works, raised limit to measure capacity.
- [Plain HTTP exposes traffic] → Read-only public data only; TLS with a domain listed as follow-up.
