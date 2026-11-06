#!/usr/bin/env bash
# Removes the VM, address and firewall rules.
set -euo pipefail
cd "$(dirname "$0")/.."
terraform -chdir=infra destroy
