import type { Sentiment } from "./api";

export function sentimentSummary(data: Sentiment | undefined, done: boolean, failed: boolean): string {
  return !done ? "Checking..." : !data ? (failed ? "Sentiment unavailable right now." : "Sentiment unavailable.")
    : failed ? `Could not refresh sentiment. The last received sample was checked ${data.asOf}; it may be stale. Refresh to try again.`
    : !data.enabled ? "Not collected (the model is off, as in mock mode). No sentiment has been estimated."
    : data.modelStatus !== "ready" ? `Model ${data.modelStatus}. No sentiment has been estimated.`
    : data.total === 0 ? "No matching posts to classify in the last 24 hours."
    : `${data.positive} positive, ${data.neutral} neutral, ${data.negative} negative of ${data.total} top posts, last 24 hours.`;
}
