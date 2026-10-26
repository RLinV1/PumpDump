# Proposal

## Why

The project depends on several outside services and models, and "free to use" is not one rule: it depends on each source's terms, whether the use is commercial, and what is stored or shown. A source audit found real risks: social data terms differ for commercial use and for storing content, one popular finance language model is licensed non-commercial and share-alike, and a market-data plan covers only a small live watchlist on one venue. This change turns those findings into rules the system enforces, so the project stays free and inside the terms as it grows.

## What Changes

- Add a data-source register listing every source, plan, limit, terms link and the date it was last verified, and fail the build when a source lacks an entry.
- Make free-tier use the default: paid feeds stay disabled unless explicitly enabled, and the active plan is logged at startup.
- Limit what is stored from social content to derived data, honor deletions, and never show raw posts or author names publicly.
- Enforce client-side rate limits below each source's published limit, and identify automated clients where a source requires it.
- Add a license gate for code, packages and models that fails on non-commercial or incompatible licenses.
- Require the not-advice notice on every output and the non-commercial status on the project's public pages.
- Out of scope: legal advice. The register records terms as understood on a date and must be rechecked before any commercial use.

## Capabilities

### New Capabilities
- `data-source-compliance`: Source register, free-tier defaults, storage limits, rate limits and the license gate that keep the system free and inside its sources' terms.

### Modified Capabilities
<!-- None. -->

## Impact

- Touches the connectors from `add-ingestion-pipeline` and `add-news-ingestion` (rate limiters, plan flags, storage rules), the API from `add-alerts-and-api` (no raw content) and the model work in `add-pump-scoring-model` (model licenses).
- New files: `docs/data-sources.md` (the register), `docs/free-use-audit.md` (the findings), a CI job for the license gate.
- Assumption to confirm: each source's current terms, which could not all be read from official pages during the audit (see `docs/free-use-audit.md`).
