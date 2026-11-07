# Deploy to Google Cloud

One Compute Engine VM runs the whole stack with Docker Compose. Caddy forwards everything on port 80 to the web server, which answers market-movers, news and sentiment itself and proxies the rest of `/api` to the private API. The compose `web` service forces `DATA_MODE=live`. This is a test deployment, not production: plain HTTP, one VM, no autoscaling.

## Prerequisites

- A Google Cloud project with billing, and `gcloud auth application-default login` done.
- Terraform 1.5+, `ssh`, `git`, and a filled `.env` (copy `.env.example`; set `API_ALLOWED_ORIGINS` to the VM URL if you call the API from another origin).
- Set a strong `POSTGRES_PASSWORD` in `.env` before the first start.
- Set `API_RATE_LIMIT_PER_MINUTE` high (for example `100000`) before a capacity load test, and leave the default for a protection test.

## Data on the public VM

The VM always serves labelled mock data, and `deploy/up.sh` strips every `ALPACA_` line from `.env` before copying it. Alpaca's free plan is for personal use and public redistribution rights are unverified (`docs/data-sources.md`), so real market data stays on your own machine: set `DATA_MODE=live` and your keys in the local `.env`. Stock lookup and paper trading (Research) follow the same rule: `deploy/up.sh` pins them to mock data, so the VM never shows real prices, and every figure is labelled MOCK. Paper accounts are anonymous tokens in a SQLite file on the `researchpaper` volume.

## Create

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # fill in project, your IP /32, your SSH public key
terraform -chdir=infra init && terraform -chdir=infra apply
deploy/up.sh                                                # copies repo and .env, starts compose, waits for ready
```

Add `billing_account` to `terraform.tfvars` to create the budget alarm (default 25 USD).

## Verify

```bash
deploy/ready.sh http://<vm-ip>
```

## Load test

Mock mode answers `/api` in the web server, so deploy with `DEPLOY_DATA_MODE=live deploy/up.sh` for a load test. This reaches the Java API with no Alpaca keys, and the VM holds only `load/seed.sql` data. Redeploy with plain `deploy/up.sh` afterwards.

Run from a second machine (Cloud Shell works) so the VM link is what you measure.

```bash
BASE=http://<vm-ip> VUS=100 CONNS=1000 RATE_LIMIT=100000 load/run.sh
```

`RATE_LIMIT` is only recorded in the summary; set it to the `API_RATE_LIMIT_PER_MINUTE` the VM runs with. Needs `k6` or Docker on the machine (Node is optional; Docker supplies it). Limits apply per client address, and the load generator is one client, so for a capacity run also set `API_MAX_STREAMS` and `API_MAX_STREAMS_PER_CLIENT` above `CONNS`. Seed data first with `docker compose exec -T postgres psql -U pumpwatch -d pumpwatch < load/seed.sql`, or the test reads an empty database.

Output lands in `load/results/summary.md`: requests per second, p50/p95/p99 latency, error rate, 429 count, and live-stream connections held. Quote the VM size (`e2-standard-2` by default), VU count and rate limit with any number.

## Destroy

```bash
deploy/down.sh
```

## Follow-ups (not done)

TLS with a domain, restricting port 80 behind a CDN, managed Postgres.
