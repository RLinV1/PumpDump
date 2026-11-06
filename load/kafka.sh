#!/usr/bin/env bash
# Broker limit test on a throwaway topic; real topics are not touched. Usage: load/kafka.sh  (needs the compose kafka service)
set -uo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite /opt/kafka into a Windows path
K=(docker compose exec -T kafka)
B=/opt/kafka/bin
BS="--bootstrap-server kafka:19092"
"${K[@]}" $B/kafka-topics.sh $BS --delete --topic loadtest-kafka >/dev/null 2>&1
"${K[@]}" $B/kafka-topics.sh $BS --create --topic loadtest-kafka --partitions 6 --replication-factor 1 >/dev/null
perf() { # records, msg/s (-1 = unthrottled), acks, linger ms, batch bytes, compression
  "${K[@]}" $B/kafka-producer-perf-test.sh --topic loadtest-kafka --num-records "$1" --record-size 256 --throughput "$2" \
    --producer-props bootstrap.servers=kafka:19092 acks="$3" linger.ms="${4:-5}" batch.size="${5:-65536}" compression.type="${6:-none}" 2>&1 | tail -1
}
echo "unthrottled acks=all: $(perf 5000000 -1 all)"
echo "unthrottled acks=1 lz4: $(perf 5000000 -1 1 10 262144 lz4)"
for rate in 50000 100000 200000 400000; do echo "fixed $rate msg/s acks=all: $(perf $((rate * 20)) "$rate" all)"; done
echo "consume: $("${K[@]}" $B/kafka-consumer-perf-test.sh $BS --topic loadtest-kafka --messages 5000000 --timeout 60000 2>&1 | tail -1)"
"${K[@]}" $B/kafka-topics.sh $BS --delete --topic loadtest-kafka >/dev/null
