# Proposal

## Why

The owner wants the project deployable on AWS as well as Google Cloud, using the AWS services employers recognise (containers on ECS, a load balancer, a managed database, infrastructure as code with least-privilege IAM and cost guards). The Google Cloud VM path stays. CI must not deploy to AWS for now.

## What Changes

- Add `infra/aws/` Terraform (hashicorp/aws): VPC, ECR, ECS on Fargate with Cloud Map discovery, an Application Load Balancer, RDS PostgreSQL 17, Secrets Manager, CloudWatch dashboard and alarms with SNS, an AWS Budgets alarm, autoscaling, and optional Amazon MSK and GitHub OIDC role.
- Add `deploy/aws-up.sh` and `deploy/aws-down.sh`, run by the owner.
- Add a manual-only `aws-deploy.yml` workflow; add credential-free `terraform fmt` and `validate` to `ci.yml`.
- Add `docs/operations/aws.md` with a runbook and a labelled cost estimate, and a README section with a diagram.
- Out of scope: running `terraform apply` or touching any AWS account in this change, production hosting, NAT Gateway, WAF, remote state (a commented example only), changes to application code, Elastic Beanstalk.

## Capabilities

### New Capabilities
- `aws-deployment`: Create, verify and destroy a disposable ECS Fargate deployment of the whole stack on mock data, with spending guarded and secrets kept out of files.

### Modified Capabilities
<!-- None. Does not revive `add-ec2-smoke-deployment`. -->

## Impact

- New files: `infra/aws/*`, `deploy/aws-*.sh`, `.github/workflows/aws-deploy.yml`, `docs/operations/aws.md`. `ci.yml` gains one job.
- External systems: one AWS account. Running it costs roughly 0.20 USD an hour (0.24 with MSK); see the runbook.
