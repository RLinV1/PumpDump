#!/bin/bash
# Runs as root on every boot; installs Docker once. The repo and .env arrive later over SSH (deploy/up.sh).
set -e
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker pumpwatch || true
mkdir -p /opt/pumpwatch && chown pumpwatch /opt/pumpwatch
