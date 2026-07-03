import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Panel } from "../components/terminal/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtSignedPct, fmtUSD } from "../utils";

/** Prefers the real Clerk username/name (resolved server-side); falls back to
 *  an anonymized handle when that lookup isn't configured or fails. */
function labelFor(userId: string, displayName: string | null): string {
  if (displayName) return displayName;
  if (userId === "anonymous") return "Anonymous";
  const tail = userId.replace(/^user_/, "").slice(-6);
  return `Trader ${tail}`;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardView() {
  const { data, isLoading } = useQuery({
    queryKey: ["paper-leaderboard"],
    queryFn: api.paperLeaderboard,
    refetchInterval: 30_000,
  });

  if (data?.error) {
    return (
      <Panel title="PAPER TRADE LEADERBOARD">
        <p className="text-sm text-down">{data.error}</p>
      </Panel>
    );
  }

  const rows = data?.leaderboard ?? [];

  return (
    <div className="space-y-3">
      <Panel title="PAPER TRADE LEADERBOARD">
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Ranked by total profit on simulated paper accounts (starting balance to
          now). Simulated money only — no real trades or personal data involved.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No simulated trades yet — place a paper trade to appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] font-mono text-xs">
              <thead>
                <tr className="micro border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Rank</th>
                  <th className="py-2 pr-3">Trader</th>
                  <th className="py-2 pr-3 text-right">Total value</th>
                  <th className="py-2 pr-3 text-right">Profit</th>
                  <th className="py-2 pr-3 text-right">Return</th>
                  <th className="py-2 pr-3 text-right">Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const you = r.user_id === data?.you;
                  return (
                    <tr
                      key={r.user_id}
                      className={cn(
                        "border-b border-border/40",
                        you && "bg-primary/10",
                      )}
                    >
                      <td className="py-2 pr-3 tnum">
                        {MEDAL[r.rank - 1] ?? `#${r.rank}`}
                      </td>
                      <td className="py-2 pr-3 font-bold">
                        {labelFor(r.user_id, r.display_name)}
                        {you && (
                          <span className="ml-1.5 rounded-sm bg-primary px-1 py-0.5 text-[0.5625rem] font-bold text-primary-foreground">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tnum">{fmtUSD(r.total_value)}</td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right tnum font-bold",
                          r.profit >= 0 ? "text-up" : "text-down",
                        )}
                      >
                        {r.profit >= 0 ? "+" : ""}
                        {fmtUSD(r.profit)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right tnum",
                          r.return_pct >= 0 ? "text-up" : "text-down",
                        )}
                      >
                        {fmtSignedPct(r.return_pct / 100)}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-muted-foreground">
                        {r.n_trades}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
