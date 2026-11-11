# Live landing page implementation plan

**Goal:** Finish section 3 of `openspec/changes/add-alerts-and-api/tasks.md`.

**Architecture:** Preserve the static landing shell and simulated market on first paint. Fetch a live snapshot after paint with a 2.5-second deadline, polling every 30 seconds. Replace the whole market with a dynamically loaded live chart and aggregate evidence only when real data exists. Proxy API traffic through Next.js using a server-only `API_ORIGIN`.

**Tech stack:** Existing Next.js, React, TypeScript; Node's built-in test runner, no new dependencies.

**Spec:** `openspec/changes/add-alerts-and-api/specs/web-live-view/spec.md` and the adjacent `design.md`.

## Constraints and review focus

- Never mix invented and real values within the market panel.
- Keep the landing shell server rendered and independent of API response time.
- Render scores, counts and contributions only; never raw social content.
- Empty scores and flags, malformed data, network failure and timeout preserve simulation.
- A live watchlist without flags remains live and explicitly says no flags.
- A failed refresh returns to the explicitly labeled simulation.
- Abort pending work on unmount and prevent overlapping polls.

## Tasks

- [x] Add failing API tests for populated, quiet, empty, malformed, failed and timed-out snapshots; verify the failures.
- [x] Implement snapshot loading in `web/lib/api.ts`, share the deadline across requests, and run tests.
- [x] Add `landing-market.tsx` and `live-market.tsx`; reuse `LiveChart` and preserve `Market` as the initial fallback passed from `Hero`.
- [x] Configure `/api/:path*` rewrites to `API_ORIGIN` and use same-origin API URLs; document setup.
- [x] Run tests, lint, production build, and desktop/mobile browser checks for live, quiet and fallback states.
- [x] Compare initial JS and first paint with the baseline; update OpenSpec tasks with verified results.

## Execution notes

Continue in this checkout under the user's instruction to keep working. Preserve the established visual design. This implements an existing design rather than introducing a new product direction. No deployment or external writes are needed.

The user subsequently requested mock data now and a root `.env` variable to switch to live data later.
Added `DATA_MODE=mock|live`, a read-only aggregate mock API including SSE, explicit mode labels and cross-mode
snapshot rejection. Mock responses never enter the backend pipeline. Provider keys remain blank.

Independent review found and fixed event-time ordering, shared proxy rate limiting, forwarding-header trust,
SSE shutdown, normalized-path mock bypass and root environment loading during builds. The performance
reviewer replaced the extra Motion runtime with the existing GSAP engine. See the verification report.
