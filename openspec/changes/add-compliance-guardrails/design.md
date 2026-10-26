# Design

## Context

See proposal.md and `docs/free-use-audit.md` for the findings. The system takes data from four kinds of source, runs open-source infrastructure and trains a small model. Each has its own terms, and several can change.

## Goals / Non-Goals

**Goals:**
- Stay at no cost and inside each source's stated terms for a non-commercial portfolio project.
- Make the rules checkable by the build, not remembered by a person.

**Non-Goals:**
- Legal review, or readiness for commercial use. Commercial use would need new agreements with several sources and is outside this project.

## Decisions

**A plain register file, checked by a test.** `docs/data-sources.md` has one row per source. A unit test reads the connector configuration and fails if a source has no row, no terms link or a verification date older than a configured age. Alternative: a database table. Rejected: a reviewed file in the repository is simpler and visible in pull requests.

**Free-tier mode as a configuration default.** Each connector declares its plan and limits in configuration. The default plan is the free one. Enabling a paid feed needs an explicit setting, and startup logs the result. This prevents quietly depending on a paid feed.

**Store derived data, keep raw text out.** Social content is reduced at ingestion to an identifier, an author-age bucket, a fingerprint, tickers and times. This answers storage and deletion terms in the simplest way: there is little to delete, and what remains is not the content. Training uses features, not text, except offline text experiments on a small, private, short-retention sample.

**License gate in CI.** The web side uses a license listing of the lockfile. The Java side uses the Maven license plugin. The Python side uses a pinned license report. A model must list its license in its model card, and the gate rejects non-commercial, unknown and share-alike licenses for anything shipped. This is why a finance language model with a non-commercial share-alike license is excluded and a small Apache-2.0 embedding model is used instead.

**Public output is aggregate-only.** The API and the page cannot return raw content because the data is not kept, and tests assert the response shapes.

**Open infrastructure choices.** Kafka and Postgres are open source under permissive licenses. For infrastructure as code, use OpenTofu (an open-source fork) or accept Terraform's source-available license, which allows non-competing use. OpenTofu is the default here, to keep every tool open source.

## Risks / Trade-offs

- [Terms change without notice] → Verification dates in the register, and a test that fails when they go stale, prompt a recheck.
- [Official terms for some sources could not be read during the audit] → Mark those entries unverified, treat them conservatively, and replace them with the official text when read.
- [A free tier can be withdrawn] → Connectors are behind an interface, so a source can be swapped, and replay of recorded data keeps demos working.
- [Storing less limits research] → Derived features cover the model's needs; any text experiment is small, private and short-lived.
