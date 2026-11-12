import { isIP } from "node:net";

// One client = one IPv4 address or one IPv6 /64 (same grouping as the Java RateLimitFilter).
export function clientKey(address) {
  if (typeof address !== "string") return "unknown";
  const addr = address.split("%")[0].trim().toLowerCase();
  const mapped = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  if (isIP(addr) !== 6) return addr || "unknown";
  const [head, tail] = addr.includes("::") ? addr.split("::") : [addr, ""];
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = addr.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return `${full.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

// Sliding window per client plus one global cap. Rejected requests add nothing, and expired clients are swept once a window.
export function createRateLimiter({ perClient, all, windowMs = 60_000, now = Date.now }) {
  const hits = new Map(); // client key -> request times inside the window; shortcut: in memory, resets on restart
  let total = [], swept = now();
  const limiter = (address) => {
    const t = now();
    const live = (x) => t - x < windowMs;
    total = total.filter(live);
    if (t - swept >= windowMs) {
      swept = t;
      for (const [k, v] of hits) if (!v.some(live)) hits.delete(k);
    }
    const key = clientKey(address);
    const mine = (hits.get(key) ?? []).filter(live);
    if (mine.length >= perClient || total.length >= all) {
      if (mine.length) hits.set(key, mine); else hits.delete(key);
      return false;
    }
    mine.push(t); total.push(t); hits.set(key, mine);
    return true;
  };
  limiter.size = () => hits.size;
  return limiter;
}
