import { useStream } from "../../stores/streamStore";
import { useWorkspace, VIEWS, VIEW_LABEL, type View } from "../../stores/workspace";
import { cn } from "@/lib/utils";

/** Mobile view switcher — the header's <nav> is hidden below `md`, this fixed
 *  bottom bar takes over. All 7 views stay reachable via horizontal scroll
 *  rather than curating a subset. */
export function BottomNav() {
  const view = useWorkspace((s) => s.view);
  const setView = useWorkspace((s) => s.setView);
  const unseen = useStream((s) => s.unseen);

  return (
    <nav
      data-tour="nav-mobile"
      aria-label="Views"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex w-full overflow-x-auto">
        {VIEWS.map((v: View, i) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "relative flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-1.5 font-mono text-[0.5625rem] font-bold tracking-wider",
              view === v ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span className="opacity-60">{i + 1}</span>
            {VIEW_LABEL[v]}
            {v === "alerts" && unseen > 0 && (
              <span className="absolute right-2 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-down px-0.5 text-[0.5625rem] font-bold text-white">
                {unseen}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
