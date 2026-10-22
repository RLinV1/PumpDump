# Design

## Context

See proposal.md. Flags and scores already exist on topics and in Postgres from `define-system-architecture`. This change reads them and adds the way out of the system.

## Goals / Non-Goals

**Goals:**
- A small, safe, read-only surface.
- A page that is fast with or without the API.

**Non-Goals:**
- User accounts, personalisation, write endpoints, mobile push, paid messaging.

## Decisions

**Spring Boot `api` module with REST for reads and Server-Sent Events for the flag stream.** SSE is one-way, reconnects by itself in browsers and needs no extra library. Alternative: WebSocket. Rejected: two-way is not needed and SSE is simpler to proxy.

**Read from Postgres, not Kafka, for history, and from the `flags` topic for the stream.** History queries are time-range reads that fit a table. The stream is the topic. Alternative: the API consuming everything from Kafka and caching. Rejected: it duplicates state.

**Public-safe by design.** The API never returns raw post text or author identifiers, only counts and contributions, rate-limits per client, and allows only configured origins. This also keeps the project inside the source terms (see `add-compliance-guardrails`).

**Alerts through webhooks only.** A chat webhook is free, needs no account system, and is enough for one operator. Alternative: email or SMS. Rejected: either needs a provider with limits or cost.

**Web integration without blocking.** The page stays a static, server-rendered page. A small client component fetches the API after first paint, with a short timeout, and swaps in the live view only if it returns live data. Otherwise the labelled simulation stays. Alternative: server-side fetching on each request. Rejected: it would tie page speed to the API.

**Same-origin proxy.** The web host proxies `/api` to the API host, so the browser needs no cross-origin setup and the API origin can stay private.

## Risks / Trade-offs

- [A public endpoint can be abused] → Rate limits, read-only, no raw content, and the page keeps working if the API is throttled.
- [Live data looks quiet most of the time, because real flags are rare] → The live view shows the watchlist's current scores and recent flags, and says plainly when there are none, instead of falling back to the simulation silently.
- [The stream can drop on small hosts] → Heartbeats and client reconnect with the last event id.
