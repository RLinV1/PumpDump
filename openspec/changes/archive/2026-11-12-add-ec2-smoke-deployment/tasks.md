## 1. Infrastructure code

- [ ] 1.1 Write `infra/` with one instance, a security group limited to the operator's address and the web port, and a key pair
- [ ] 1.2 Add a boot script that installs the container runtime and starts the compose file
- [ ] 1.3 Add a reverse proxy service to compose that serves the web app and forwards `/api`
- [ ] 1.4 Add a budget alarm with a configurable amount and recipient
- [ ] 1.5 Add create and destroy scripts, and make destroy the last step of the proof-run script

## 2. Secrets and health

- [ ] 2.1 Add an environment-file template listing required keys with no values
- [ ] 2.2 Copy the real environment file over SSH after boot and keep it out of state and logs
- [ ] 2.3 Add health checks for ingestion, scoring and the API, and a combined readiness check

## 3. Rehearsal

- [ ] 3.1 Run the infrastructure code against the local AWS emulator and fix wiring errors
- [ ] 3.2 Add a secrets scan of the repository and the state files

## 4. Proof run

- [ ] 4.1 Write the runbook: prerequisites, account check, create, verify, run, destroy
- [ ] 4.2 Run the proof: live ingestion for a small watchlist, a recording, and a replay
- [ ] 4.3 Generate the proof report with counts, flags, replay result and cost estimate
- [ ] 4.4 Confirm destroy removed every resource and record the final bill estimate
