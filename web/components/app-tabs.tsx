import Link from "next/link";

const TABS = [{ href: "/live", label: "Terminal" }, { href: "/paper", label: "Paper" }];

// The two operate surfaces. The current one is reverse video, like the selected watchlist row.
export function AppTabs({ current }: { current: "/live" | "/paper" }) {
  return (
    <nav aria-label="Sections" className="flex shrink-0">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border border-accent px-3 text-xs font-semibold uppercase lg:min-h-8 ${t.href === current ? "bg-accent text-bg" : "text-accent hover:bg-accent hover:text-bg"} [&+&]:border-l-0`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
