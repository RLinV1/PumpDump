# Design

## Context

Same stack as `add-gcp-deployment`: Kafka, Postgres, four Spring Boot services, a Next.js web server with its own `/api` handling, and an SSE stream that broke when routed through the web server. The owner wants an AWS version built from services employers recognise, kept disposable, with no AWS access used while writing it.

## Goals / Non-Goals

**Goals:** idiomatic Terraform, few readable files, least privilege, cost guards, no application code change.
**Non-Goals:** production hosting, high availability, NAT, WAF, remote state, deploying from CI.

## Decisions

**ECS on Fargate, not EC2 or Kubernetes.** Containers already exist; Fargate removes hosts to patch and is the common managed-container choice. EKS costs more and adds setup. Elastic Beanstalk is not used. This does not revive `add-ec2-smoke-deployment`, which was a single VM and stays superseded by the GCP change.

**Application Load Balancer with a path rule.** It routes by path (the stream goes to `api`, the rest to `web`), supports health checks and HTTPS with ACM, and its `X-Forwarded-For` append mode gives the web server's right-most-entry rule the real client. Idle timeout 120 s against the 15 s heartbeat.

**Fargate in public subnets, no NAT Gateway.** A NAT Gateway costs about as much as the rest of the small stack. Tasks get public IPs only to pull images and write logs; security groups admit only the ALB and peers. RDS and MSK stay in private subnets with no internet route. Trade-off: tasks have public addresses; the security groups are the control.

**Cloud Map for discovery.** `web` needs `api`, apps need Kafka, and Plutus needs `web`, without an internal load balancer. The web image bakes the API origin at build time, so the namespace name is fixed by the `name` variable.

**RDS PostgreSQL 17, generated password in Secrets Manager.** Managed Postgres is the standard employer-recognised choice and matches `postgres:17` in compose. `random_password` puts the value in state, which is documented; RDS-managed passwords would avoid that but rotate weekly and break long-lived connection pools.

**Kafka: single Fargate task by default, MSK behind `enable_msk`.** MSK is the biggest cost line, so it is off. The default task uses the compose KRaft settings plus a loopback listener, because ECS registers a task in Cloud Map only after it is healthy and the advertised name would not exist yet. Its data is lost on restart (stated in the docs). Topics: a sidecar in the broker task (re-runs after restarts); for MSK a one-off task run by `aws-up.sh`, plus `auto.create.topics` as a fallback.

**ECR mirror of the Kafka image.** Fargate public IPs are shared and Docker Hub rate limits anonymous pulls.

**connectors and replay at 0 tasks.** With mock data and no Alpaca keys every source is off, so connectors idle; replay replays what connectors recorded. They are defined so they can be switched on by variable.

**IAM written out.** The execution role lists ECR pull on the repository ARNs, log writes on one log group and one secret, instead of the AWS managed policy (all resources). The task role is empty because the apps call no AWS APIs. The GitHub deploy role is scoped to this repository's `main` branch through OIDC and to specific ECR and ECS ARNs.

**Manual-only deploy workflow.** The owner said CI must not deploy to AWS. `aws-deploy.yml` has only `workflow_dispatch` and requires typing `deploy`; the OIDC role is off by default.

## Risks / Trade-offs

- Nothing was planned or applied, because no credentials were used. Provider arguments were checked only by `terraform validate`; expect small fixes on the first real plan (for example the MSK `3.9.x` version).
- Hourly cost is about 0.20 USD with no usage; forgetting to destroy is the main risk. Mitigations: Budgets alarm, docs warning, one-command destroy.
- State holds the generated DB password; local state is gitignored.
