#!/usr/bin/env bash
# Start Kafka (KRaft) + Postgres, create topics, list them.
# --apps also builds and starts the ingestion, scoring and API services in containers.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --wait kafka postgres
docker compose run --rm kafka-init || { echo "topic creation failed" >&2; exit 1; }
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
if [ "${1:-}" = "--apps" ]; then docker compose --profile apps up -d --build --wait connectors replay pipeline api; fi
