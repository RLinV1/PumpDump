# Design

## Context

See proposal.md. The stack is Kafka, Postgres, several Spring Boot services and the web app, started by one compose file. For a short test, one machine with enough memory for all of them is the cheapest honest proof.

## Goals / Non-Goals

**Goals:**
- Cheap, short-lived, easy to destroy.
- The same containers as the laptop, so the test proves portability.

**Non-Goals:**
- High availability, security hardening beyond sensible defaults, or any production claim.

## Decisions

**One EC2 instance running docker compose.** A medium general-purpose size gives about 4 GB of memory, which is enough for Kafka, Postgres and a few JVM services at this scale. Alternatives: ECS, EKS or managed Kafka. Rejected: each adds a recurring cost or setup that a one-off test does not justify.

**OpenTofu for the infrastructure code, Terraform-compatible.** The code uses plain providers and resources so either tool runs it. OpenTofu is open source, which keeps every tool free to use. Alternative: Terraform, whose license is source-available and allows this use. Either works.

**Rehearse locally first.** Run the same infrastructure code against a local AWS emulator to catch mistakes, then run once against the real account. The emulator's student plan is free. Not every service behaves identically, so the rehearsal checks wiring, not cost or networking.

**Secrets by file, not by state.** An environment file is copied to the machine over SSH after it boots. It is never an infrastructure variable, so it never reaches the state file.

**Cost guard.** A budget alarm at a small fixed amount, the smallest viable size, no extra volumes, no elastic IP left behind, and a reminder in the runbook to destroy after the proof run. The destroy command is part of the proof-run script, so the default path ends with teardown.

**Same-origin web and API.** A small reverse proxy in the compose file serves the web app and forwards `/api` to the API service, so only one public port is needed.

## Risks / Trade-offs

- [A forgotten machine keeps billing] → Budget alarm, destroy as the last script step, and a calendar reminder in the runbook.
- [A medium instance may be short of memory under load] → Set memory limits per container and watch the proof report; move up one size only if needed.
- [The free allowance may not apply to the account] → Check the account's offer first, and state the estimated cost in the proof report.
- [Data sources may block a cloud address] → Test connectivity early in the run, and fall back to replay of recorded data to complete the proof.
