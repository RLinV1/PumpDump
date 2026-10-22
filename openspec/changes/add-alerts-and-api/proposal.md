# Proposal

## Why

Flags only matter if someone can see them. Today the landing page shows a simulated demo because there is no real output to show. This change exposes scores and flags through a small read-only API, delivers alerts, and lets the web page show real flags once they exist, while never mixing real and simulated data.

## What Changes

- Add a read-only API: the watchlist with latest scores, a per-ticker timeline for charts, recent flags, and a live stream of new flags.
- Add alert delivery of flags through webhooks, with retries, a cooldown and a fixed disclaimer.
- Add a live view to the web app that uses the API when it is reachable and otherwise shows the existing labelled simulation.
- Out of scope: accounts, per-user watchlists, paid delivery channels, trading or broker features.

## Capabilities

### New Capabilities
- `risk-score-api`: Read-only HTTP and streaming access to scores, timelines and flags.
- `alert-delivery`: Webhook delivery of flags with retries, cooldown and a disclaimer.
- `web-live-view`: The landing page shows real flags when available and a labelled simulation otherwise.

### Modified Capabilities
<!-- None. -->

## Impact

- Reads the `scores` and `flags` topics and tables defined in `define-system-architecture`.
- New code: a Spring Boot `api` module, a webhook notifier, and a small client in `web/`.
- External systems: a chat webhook URL (free) supplied by the operator. No email or SMS service is used, to stay free.
- The page must keep working with the API down, so the simulation stays as the fallback.
