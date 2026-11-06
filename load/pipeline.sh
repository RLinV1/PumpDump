#!/usr/bin/env bash
# Scoring-pipeline throughput on a throwaway compose project with its own volumes; your data is not touched.
# Loads a backlog of valid ticks first, then times how fast the pipeline drains it, so the producer cannot be the limit.
# Stop the main stack first (ports are shared). Usage: TICKS=1000000 MEASURE=150 load/pipeline.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
TICKS=${TICKS:-1000000}
DC=(docker compose -p pwload --profile apps)
K=("${DC[@]}" exec -T kafka)
B=/opt/kafka/bin
BS="--bootstrap-server kafka:19092"
trap '"${DC[@]}" down -v --remove-orphans >/dev/null 2>&1' EXIT
offsets() { "${K[@]}" $B/kafka-get-offsets.sh $BS --topic "$1" 2>/dev/null | awk -F: '{ s += $3 } END { print s + 0 }'; }
committed() { "${K[@]}" $B/kafka-consumer-groups.sh $BS --describe --group pumpwatch-pipeline 2>/dev/null | awk '$2 == "ticks" && $4 ~ /^[0-9]+$/ { s += $4 } END { print s + 0 }'; }
"${DC[@]}" up --build kafka-init >/dev/null 2>&1 # attached: topics must exist with all partitions before ticks are sent
# Valid upper-case tickers; event time spans one hour so windows close and features are really computed.
"${K[@]}" sh -c "awk -v n=$TICKS 'BEGIN { t0 = systime() - 3600; for (i = 0; i < n; i++) { k = i % 50; s = sprintf(\"L%c%c\", 65 + int(k / 26), 65 + k % 26); e = strftime(\"%Y-%m-%dT%H:%M:%SZ\", t0 + int(i * 3600 / n), 1); printf \"%s|{\\\"schemaVersion\\\":1,\\\"eventTime\\\":\\\"%s\\\",\\\"ingestTime\\\":\\\"%s\\\",\\\"ticker\\\":\\\"%s\\\",\\\"price\\\":%.2f,\\\"size\\\":100,\\\"exchange\\\":\\\"V\\\"}\n\", s, e, e, s, 10 + (i % 97) / 10 } }' | $B/kafka-console-producer.sh $BS --topic ticks --property parse.key=true --property key.separator='|' --producer-property linger.ms=5 --producer-property batch.size=65536"
total=$(offsets ticks)
echo "backlog loaded: $total ticks"
"${DC[@]}" up -d pipeline >/dev/null 2>&1
until [ "$(committed)" -gt 0 ]; do sleep 1; done
first=$(committed); start=$(date +%s)
echo "first commit at $first"
deadline=$(( start + ${MEASURE:-150} ))
while [ "$(date +%s)" -lt "$deadline" ]; do c=$(committed); [ "$c" -ge "$total" ] && break; sleep 3; done
end=$(date +%s); c=$(committed); secs=$(( end - start > 0 ? end - start : 1 ))
echo "drained $((c - first)) ticks in $secs s: $(( (c - first) / secs )) ticks/s, remaining lag $((total - c))"
sleep 20
echo "features emitted: $(offsets features)"
echo "scores emitted: $(offsets scores)"
echo "flags emitted: $(offsets flags)"
echo "dead letters: $(offsets ingest-dlq)"
"${DC[@]}" logs pipeline 2>&1 | grep -ciE "exception|error" | sed 's/^/pipeline error lines: /'
