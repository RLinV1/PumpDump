#!/bin/bash
# Runs as root on every boot; installs Docker once. The repo and .env arrive later over SSH (deploy/up.sh).
set -e
# The guest agent that creates the SSH user from metadata may not have run yet, so create it here.
id pumpwatch >/dev/null 2>&1 || useradd -m -s /bin/bash pumpwatch
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker pumpwatch
mkdir -p /opt/pumpwatch
chown pumpwatch /opt/pumpwatch
# deploy/up.sh waits for this file, so it never copies into a half-set-up VM
touch /opt/pumpwatch/.vm-ready
