# Labeled episodes

Metadata only: ticker, dates, source URLs, a short note. No price data, no article text.

`episodes.csv` columns: `id`, `ticker`, `class`, `start`, `end` (YYYY-MM-DD), `source_urls` (space-separated https links; empty only for `control`), `note`, `confidence`, `labeled_on`.

- `class`: `pump`, `news_mover`, `hype_no_manipulation`, `control`.
- `confidence`: `high` or `uncertain`. Uncertain means approximate dates, a window much wider than the likely pump, or a negative that could plausibly have been manipulation. Uncertain rows are listed in `REVIEW.md`.
- Pump windows from SEC trading-suspension orders are the suspension period, not a proven manipulation window, and a suspension is not a finding. They are marked uncertain unless the order states the exact trading window.
- Controls are the same ticker as a news-mover row, in a quiet fortnight a year earlier. They were chosen by rule, not checked for news one by one.
- Survivorship: every pump here was caught. The model flags pump-like behavior; it does not prove manipulation.

Commands, from `ml/`:

    python -m pumpml.labels validate
    python -m pumpml.labels report     # writes REPORT.md and REVIEW.md

Training on real labels is refused when any class has fewer than `MIN_PER_CLASS` episodes (`ml/pumpml/labels.py`). Synthetic mode is not gated. `VERSION.json` holds the dataset version and the reason for each change.
