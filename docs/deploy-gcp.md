# Deploy to Google Cloud

One Compute Engine VM runs the whole stack with Docker Compose. Caddy serves the web app and forwards `/api` to the API on port 80. This is a test deployment, not production: plain HTTP, one VM, no autoscaling.

## Prerequisites

- A Google Cloud project with billing, and `gcloud auth application-default login` done.
- Terraform 1.5+, `ssh`, `git`, and a filled `.env` (copy `.env.example`; set `API_ALLOWED_ORIGINS` to the VM URL if you call the API from another origin).
- Set `API_RATE_LIMIT_PER_MINUTE` high (for example `100000`) before a capacity load test, and leave the default for a protection test.

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

Run from a second machine (Cloud Shell works) so the VM link is what you measure.

```bash
BASE=http://<vm-ip> VUS=100 CONNS=80 load/run.sh
```

Output lands in `load/results/summary.md`: requests per second, p50/p95/p99 latency, error rate, 429 count, and live-stream connections held. Quote the VM size (`e2-standard-2` by default), VU count and rate limit with any number.

## Destroy

```bash
deploy/down.sh
```

## Follow-ups (not done)

TLS with a domain, restricting port 80 behind a CDN, managed Postgres.
