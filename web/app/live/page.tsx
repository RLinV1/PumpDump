import type { Metadata } from "next";
import { LiveView } from "@/components/live-view";

export const metadata: Metadata = {
  title: "Terminal | Pumpwatch",
  description: "Risk scores, prices, score timelines and flags from the Pumpwatch API, labeled live or mock. Risk signal only, not investment advice.",
};

// Operate surface: the shell is static and paints immediately; LiveView fetches after first paint.
export default function LivePage() {
  return <LiveView />;
}
