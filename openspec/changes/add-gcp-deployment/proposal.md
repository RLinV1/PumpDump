# Proposal

## Why

The project is ready to leave the laptop. The owner has Google Cloud, not AWS, so the planned EC2 smoke test (`add-ec2-smoke-deployment`) does not fit. The owner also wants measured, repeatable performance numbers (latency, throughput, error rate, concurrent live-stream clients) to cite when describing the project. Today there is no container for the web app, no single public entry point and no load test.

## What Changes

- Add a web app container image and a Caddy reverse proxy so one public port serves the web app and forwards `/api` to the API, with live streaming (SSE) passing through unbuffered.
- Add Terraform for one Compute Engine VM that runs the compose file, with a locked-down firewall, a startup script, secrets copied after boot, and a billing budget alarm.
- Add k6 load tests for the API read endpoints and the live flag stream, with pass/fail thresholds and a short results summary suitable for a README or resume.
- Add a runbook for create, verify, load test and destroy.
- Supersede `add-ec2-smoke-deployment`: same goals, Google Cloud instead of AWS.
- Out of scope: production hosting, autoscaling, managed Kafka or Postgres, Kubernetes, a custom domain and TLS (documented as a follow-up).

## Capabilities

### New Capabilities
- `gcp-deployment`: Create, verify and destroy one disposable Compute Engine VM that serves the whole stack from a single public port.
- `load-testing`: Repeatable load tests against the read API and the live stream, with thresholds and a reported summary.

### Modified Capabilities
<!-- None. -->

## Impact

- New files: `web/Dockerfile`, proxy config, `infra/` Terraform, `load/` k6 scripts, `docs/operations/gcp.md`.
- `docker-compose.yml` gains `web` and `proxy` services under the existing `apps` profile.
- `web/next.config.ts` gains `output: "standalone"`.
- External systems: one Google Cloud project with billing. The VM, its disk and egress cost money; the budget alarm is the guard.
- k6 runs as a separate tool (Docker image), not a project dependency.
