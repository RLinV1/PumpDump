#!/usr/bin/env bash
# Usage: deploy/up.sh   (run after `terraform apply` in infra/; needs a filled .env and your SSH key loaded)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "missing .env: cp .env.example .env and fill it in" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || echo "warning: uncommitted changes are not deployed (git archive HEAD)" >&2
IP=$(terraform -chdir=infra output -raw url | sed 's|http://||')
SSH="pumpwatch@$IP"
# the marker is written last by the startup script, after Docker, the docker group and /opt/pumpwatch exist
until ssh -o StrictHostKeyChecking=accept-new "$SSH" 'test -f /opt/pumpwatch/.vm-ready && docker info' >/dev/null 2>&1; do echo "waiting for VM..."; sleep 10; done
git archive HEAD | ssh "$SSH" 'tar -x -C /opt/pumpwatch'
# Secrets travel over SSH, never through Terraform state. Alpaca keys never reach this public VM: their terms cover
# personal use, and public redistribution is unverified (docs/data/sources.md). DEPLOY_DATA_MODE=live is for load tests.
# Lookup and the assistant stay on mock data; deploy/vm-env.sh copies only an allowlist of settings and forces every
# source, sentiment and alert switch off, so no key, email or webhook URL reaches the public VM.
deploy/vm-env.sh < .env | ssh "$SSH" 'umask 077; cat > /opt/pumpwatch/.env'
ssh "$SSH" 'cd /opt/pumpwatch && PROXY_BIND=0.0.0.0 docker compose --profile apps up -d --build'
deploy/ready.sh "http://$IP"
