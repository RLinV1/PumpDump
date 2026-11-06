## 1. Containers and proxy

- [ ] 1.1 Set `output: "standalone"` in `web/next.config.ts` and add `web/Dockerfile` and `.dockerignore`
- [ ] 1.2 Add `deploy/Caddyfile` routing `/api/*` to the API (unbuffered) and everything else to the web app
- [ ] 1.3 Add `web` and `proxy` services to `docker-compose.yml` under the `apps` profile with an empty `NEXT_PUBLIC_API_URL`

## 2. Infrastructure

- [ ] 2.1 Add `infra/` Terraform: VM, static address, firewall (web port, SSH from operator only), startup script
- [ ] 2.2 Add optional billing budget with configurable amount and recipient
- [ ] 2.3 Add `deploy/up.sh` and `deploy/down.sh` to create, copy repo and `.env`, start compose, and destroy
- [ ] 2.4 Add a readiness check script covering the API and the web app

## 3. Load testing

- [ ] 3.1 Add `load/api.js` (ramping read-endpoint test with thresholds)
- [ ] 3.2 Add `load/stream.js` (concurrent SSE connections, connected and dropped counts)
- [ ] 3.3 Add `load/run.sh` that runs both through the k6 image and writes `load/results/summary.md`
- [ ] 3.4 Run against the local stack and record a baseline

## 4. Docs and verification

- [ ] 4.1 Write `docs/deploy-gcp.md` runbook: prerequisites, create, verify, load test, destroy
- [ ] 4.2 Add website screenshots (Playwright) and a performance section to the README
- [ ] 4.3 Validate Terraform (`terraform validate`), compose config, web build and lint
- [ ] 4.4 Mark `add-ec2-smoke-deployment` as superseded
