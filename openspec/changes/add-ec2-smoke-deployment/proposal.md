# Proposal

## Why

The system is meant to run on a clean Linux machine, not only on a laptop. A short, cheap, disposable cloud run proves that: the same containers start, reach their data sources from the internet and sustain a few hours of live ingestion, scoring and replay. It is a test, not a production deployment, so it must be easy to create, easy to destroy and unable to run up a bill.

## What Changes

- Add infrastructure as code for one small virtual machine that runs the project's compose file, with a locked-down network.
- Add a startup script, a secrets path that keeps keys out of the repository, and health checks.
- Add a one-command teardown, a cost ceiling and a budget alarm.
- Add a local rehearsal of the same infrastructure against a free AWS emulator, so mistakes cost nothing.
- Out of scope: production hosting, autoscaling, managed Kafka or databases, container orchestration, a custom domain.

## Capabilities

### New Capabilities
- `smoke-test-deployment`: Create, verify and destroy a single disposable cloud machine that runs the whole stack for a short test.

### Modified Capabilities
<!-- None. -->

## Impact

- Uses the compose environment from `add-ingestion-pipeline` and the services from `define-system-architecture`.
- New files: infrastructure code under `infra/`, a startup script, a runbook in `docs/`.
- External systems: one AWS account. The machine, its disk and its network traffic cost money unless covered by credits; the budget alarm is the guard. The AWS emulator used for rehearsal is free for students.
- Assumption to confirm: the account's current free allowance or credits, since AWS's offer has changed over time.
