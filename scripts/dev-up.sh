#!/usr/bin/env bash
# Start Kafka (KRaft) + Postgres, create topics, list them.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --wait
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
