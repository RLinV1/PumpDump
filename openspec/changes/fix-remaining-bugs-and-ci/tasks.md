# Remaining bugs and CI warnings

Scope confirmed by the owner: remaining bugs and CI warnings, not the feature backlog or deferred cloud rollout.

- [x] Verify PR 78 merged with all 19 review findings resolved.
- [x] Verify replacement actions use Node 24 from their official action metadata.
- [x] Upgrade action versions in CI and the manual deployment workflow; pin Ubuntu 24.04.
- [x] Validate workflow syntax, inputs and unchanged manual-only deployment gating.
- [x] Investigate reproducible remaining web, research and Java defects; add regressions before fixes.
- [x] Run affected local checks and independent review.

Delivery: open a follow-up PR and follow the four CI jobs to completion. Do not merge or execute a cloud deployment.
