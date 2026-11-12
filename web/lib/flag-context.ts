import type { Flag } from "./api.ts";
import { verdictOf } from "./verdict.ts";

// What the assistant is told about the flag on screen: one plain line, capped to the server's 600 characters.
export function flagContext(f: Flag): string {
  const e = f.evidence;
  const catalyst = e.catalyst ? (e.catalyst.found ? `${e.catalyst.items.length} possible catalyst(s) found, score discounted` : "no catalyst found") : "catalyst check not run";
  const drivers = e.topContributors.map((c) => `${c.featureGroup} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)})`).join(", ");
  const line = `${f.ticker} flag: score ${Math.round(e.score)} of 100 (${verdictOf(e.score).label}). ${e.postCount} posts, ${e.tradeCount} trades. ${catalyst}.${drivers ? ` Driven by ${drivers}.` : ""}`;
  return line.replace(/[\u0000-\u001f]/g, " ").slice(0, 600);
}
