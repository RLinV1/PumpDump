# Remaining bug fixes and CI cleanup — November 8, 2026

Scope: reproducible bugs and CI warnings after PR 78, rather than new backlog features or deferred cloud deployment.

## Correctness fixes

- **Paper-account response ordering:** an older account refresh could overwrite a successful trade/reset or a newer read. Generation checks reject stale responses; reads and resets cannot overlap an in-flight write. Failed writes still allow a pending initial account read to complete. Four tests exercise the actual hook with deferred API responses.
- **Invalid Kafka records:** literal JSON null and null-valued run headers could escape the invalid-record path as null-pointer exceptions and keep a listener batch retrying. Shared JSON decoding now rejects null records; a null header is absent. Tests ensure a later valid record is processed and database failures still propagate for retry.
- **Live metadata integrity:** a provider failure previously supplied synthetic market cap and P/E while the result was labelled live. Unavailable metadata now stays null and is not cached; the next request retries. The new namespace bypasses old fallback entries without deleting price data. A missing-description path also referenced a removed mock helper; it now reports missing information honestly. Existing valid live disk metadata and explicit mock mode remain supported.
- **Trading-day history:** a 300-session request previously fetched only 310 calendar days, omitting one-year returns on the initial live lookup. Calendar requests now allow for weekends and holidays, while returned rows stay bounded to the requested session count. Requested lookbacks are stored in parquet metadata: short legacy caches refresh once, complete legacy caches remain valid, short IPO histories are reused, and a larger request obtains more history once.

## Workflow changes

All action versions were checked against their official action.yml metadata for Node 24. CI still has four jobs, PR runs plus main-branch push runs, and cancellation of superseded runs. Ubuntu 24.04 is explicit rather than changing automatically with ubuntu-latest. The AWS workflow remains manual-only and requires its existing deploy confirmation; it was not executed.

| Action | Version | Official release |
| --- | --- | --- |
| actions/checkout | v7.0.1 | [Release](https://github.com/actions/checkout/releases/tag/v7.0.1) |
| actions/setup-java | v6.2.0 | [Release](https://github.com/actions/setup-java/releases/tag/v6.2.0) |
| actions/setup-node | v7.1.0 | [Release](https://github.com/actions/setup-node/releases/tag/v7.1.0) |
| actions/setup-python | v7.1.0 | [Release](https://github.com/actions/setup-python/releases/tag/v7.1.0) |
| actions/cache | v6.1.0 | [Release](https://github.com/actions/cache/releases/tag/v6.1.0) |
| hashicorp/setup-terraform | v4.0.1 | [Release](https://github.com/hashicorp/setup-terraform/releases/tag/v4.0.1) |
| aws-actions/configure-aws-credentials | v6.3.0 | [Release](https://github.com/aws-actions/configure-aws-credentials/releases/tag/v6.3.0) |
| aws-actions/amazon-ecr-login | v2.1.7 | [Release](https://github.com/aws-actions/amazon-ecr-login/releases/tag/v2.1.7) |

## Verification

- Web: 129 tests passed; lint and production build passed. Deferred-response tests cover old refreshes, successful and failed writes, and overlapping actions.
- Research: the complete 155-test suite and Ruff passed. Eight price-history/cache tests and six metadata tests use fake provider responses and actual local parquet roundtrips; no live provider request is needed.
- Java: 20 focused CommonTest/IngestTest checks passed, including the four new regression cases. Mockito was loaded as a test JVM agent for the local JDK 24 run; full Java verification runs in CI on JDK 21.
- Workflow validation: actionlint v1.7.12 passed for both files. Parsed YAML checks preserved all four CI jobs, main-only push checks and manual-only AWS deployment gating.
- Independent review found no remaining material issues in this patch. The initial web lint caught a test fixture variable named module; it was renamed without changing the test behavior.

The new regressions demonstrated faulty behavior before fixes. The follow-up PR supplies final GitHub CI status. No cloud workflow was executed. No capacity improvement, production user count, real-provider availability or new model-accuracy claim is inferred from these fixes.
