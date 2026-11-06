## 1. Terraform

- [x] 1.1 Network: VPC, 2 public and 2 private subnets, security groups, no NAT Gateway
- [x] 1.2 ECR repositories, execution and task roles with resource-scoped policies
- [x] 1.3 RDS PostgreSQL 17 and Secrets Manager password
- [x] 1.4 ECS cluster, Cloud Map, services (web, api, pipeline, kafka; connectors and replay at 0; optional plutus), autoscaling
- [x] 1.5 ALB with stream rule, optional HTTPS and ACM
- [x] 1.6 Optional MSK, topic creation in both Kafka modes
- [x] 1.7 CloudWatch logs, dashboard, alarms, SNS, Budgets
- [x] 1.8 Optional GitHub OIDC role; provider lock file for linux and windows

## 2. Scripts, CI and docs

- [x] 2.1 `deploy/aws-up.sh` and `deploy/aws-down.sh`
- [x] 2.2 Manual-only `aws-deploy.yml`; credential-free `terraform fmt` and `validate` in `ci.yml`
- [x] 2.3 `docs/deploy-aws.md` runbook and cost table; README section with diagram

## 3. Verification

- [x] 3.1 `terraform init -backend=false`, `validate`, `fmt -check`, `bash -n`, `openspec validate`
- [ ] 3.2 First real `terraform plan` and `apply` by the owner (not done here: no credentials used)
