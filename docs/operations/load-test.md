# Load tests

Load tests live in `load/`: a ramping [k6](https://k6.io) read-API test, and a live-stream test
with real SSE clients that counts a client only if data actually reaches it.

```bash
BASE=http://<host> VUS=100 CONNS=1000 load/run.sh   # writes load/results/summary.md
```

Fresh local results (November 6, 2026): 612.6 direct-API requests/s at 100 virtual
users, successful-response p95 322.2ms, and 1,000/1,000 clients receiving a synthetic
flag through the proxy at p95 1.755s. The API run had 29 throttled responses and no
other errors. Capacity runs temporarily raised limits; normal limits were restored.

See [the performance and optimization report](../reports/performance-2026-11-06.md) for
hardware, raw results, commands, test conditions, the existing 15-second pane
optimization and its latency/late-data tradeoffs. Earlier stress numbers are clearly
separated from freshly verified results. These are local measurements, not cloud
capacity or proof of a before/after speedup.

