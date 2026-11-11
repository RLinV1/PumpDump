# Labeled episodes

Metadata only: ticker, dates, source URLs, a short note. No price data, no article text.

`episodes.csv` columns: `id`, `ticker`, `class`, `start`, `end` (YYYY-MM-DD), `source_urls` (space-separated https links; empty only for `control`), `note`, `confidence`, `labeled_on`.

- `class`: `pump`, `news_mover`, `hype_no_manipulation`, `control`.
- `confidence`: `high` or `uncertain`. Uncertain means approximate dates, a window much wider than the likely pump, or a negative that could plausibly have been manipulation.
- `policy`: required on uncertain rows, empty on high rows. Names the policy question(s) in `REVIEW.md` that cover the row (space-separated). The owner answers them in `decisions.json` (`true`, `false` or `null`). A row is trained on only when every covering policy is `true`; `null` and `false` exclude it. `long_windows: true` trims those pump windows to their first 30 days. `one_off` rows are answered one by one under `rows`.
- Pump windows from SEC trading-suspension orders are the suspension period, not a proven manipulation window, and a suspension is not a finding. They are marked uncertain unless the order states the exact trading window.
- Controls are the same ticker as a news-mover row, in a quiet fortnight away from its event. Each window was checked against the company's filing list on SEC EDGAR (data.sec.gov submissions): no 8-K, 10-K, 10-Q, S-1, prospectus or deal filing in the window. Press-only news is not covered by that check.
- Survivorship: every pump here was caught. The model flags pump-like behavior; it does not prove manipulation.

What the classes mean, how rows were sourced, and why each owner decision was made: [DECISIONS.md](DECISIONS.md).

Commands, from `ml/`:

    python -m pumpml.labels validate
    python -m pumpml.labels report     # writes REPORT.md and REVIEW.md

Training on real labels is refused when any class has fewer than `MIN_PER_CLASS` episodes (`ml/pumpml/labels.py`). Synthetic mode is not gated. `VERSION.json` holds the dataset version and the reason for each change.
