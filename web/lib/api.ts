// Read API client. Every body is { notice, data }; no field carries post text or author names.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8083").replace(/\/$/, "");

export const NOTICE = "Risk signal only. Not investment advice. Pumpwatch is a non-commercial project.";

export type Score = {
  ticker: string;
  score: number;
  modelVersion: string;
  windowEnd: string;
  computedAt: string;
  staleSources: string[];
};
export type Contributor = { featureGroup: string; delta: number };
export type Flag = {
  id: number;
  ticker: string;
  raisedAt: string;
  evidence: {
    score: number;
    modelVersion: string;
    topContributors: Contributor[];
    postCount: number;
    tradeCount: number;
    catalyst: { found: boolean; items: string[] } | null;
  };
};
export type Timeline = {
  ticker: string;
  from: string;
  to: string;
  scores: { at: string; score: number; modelVersion: string }[];
  flags: { id: number; at: string; score: number }[];
};

type Envelope<T> = { notice: string; data: T };

// Short timeout so a dead API shows its error state quickly instead of hanging the page.
export async function get<T>(path: string, ms = 6000): Promise<Envelope<T>> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const STREAM_URL = `${API_URL}/api/v1/flags/stream`;

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function age(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
