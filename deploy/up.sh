#!/usr/bin/env bash
# Usage: deploy/up.sh   (run after `terraform apply` in infra/; needs a filled .env and your SSH key loaded)
set -euo pipefail
cd "$(dirname "$0")/.."
IP=$(terraform -chdir=infra output -raw url | sed 's|http://||')
SSH="pumpwatch@$IP"
until ssh -o StrictHostKeyChecking=accept-new "$SSH" 'docker --version' >/dev/null 2>&1; do echo "waiting for VM..."; sleep 10; done
# secrets travel by scp, never through Terraform state
git archive HEAD | ssh "$SSH" 'tar -x -C /opt/pumpwatch'
scp .env "$SSH:/opt/pumpwatch/.env"
ssh "$SSH" 'cd /opt/pumpwatch && PROXY_BIND=0.0.0.0 docker compose --profile apps up -d --build'
deploy/ready.sh "http://$IP"
