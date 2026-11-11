import type { Metadata } from "next";
import { PaperView } from "@/components/paper-view";

export const metadata: Metadata = {
  title: "Paper trading | Pumpwatch",
  description: "Simulated paper trading with a browser-kept anonymous account, labeled live or mock. Paper money, not real. Not investment advice.",
};

export default function PaperPage() {
  return <PaperView />;
}
