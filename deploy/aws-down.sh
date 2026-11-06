#!/usr/bin/env bash
# Destroys everything infra/aws created (ECR images included). Run it yourself, with AWS credentials in your shell.
set -euo pipefail
cd "$(dirname "$0")/.."
terraform -chdir=infra/aws destroy
echo "destroyed. Check the AWS console (ECS, RDS, EC2 load balancers, MSK) for anything left, and your Budgets email."
