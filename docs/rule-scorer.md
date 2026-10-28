# Rule scorer (`rules-v1`) and anomaly baseline (`anomaly-v1`)

The transparent scorers that run before any trained model exists. Both read the features of one window length
(`pipeline.scoring-window-minutes`, default 5) and add points. `pipeline.scorer` picks one: `rules` (default) or
`anomaly`. `RuleScorerTest` fails if the tables below and `RuleScorer.TERMS` / `RuleScorer.ANOMALY_TERMS` differ, so
edit both together.

How a term scores: for each term, find the highest row whose feature value is **at least** the threshold; that row's
points are the term's points. A term with no matching row adds nothing. The score is the sum of all terms, kept
between 0 and 100. A flag needs the score to reach `pipeline.flag-level` (default 60).

Catalyst terms have negative points: a filing or news item that came before the move is an ordinary reason for a
move, so it lowers the score. They can never raise it, and the score never goes below 0.

## Rule table (`rules-v1`)

| Term | Group | Feature | At least | Points |
| --- | --- | --- | --- | --- |
| mention surge | social | `mentionRatio` | 3 | 20 |
| mention surge | social | `mentionRatio` | 10 | 35 |
| broad chatter | social | `distinctAuthors` | 5 | 5 |
| broad chatter | social | `distinctAuthors` | 20 | 10 |
| new accounts | social | `newAccountShare` | 0.3 | 5 |
| new accounts | social | `newAccountShare` | 0.6 | 10 |
| copied posts | social | `duplicateShare` | 0.3 | 5 |
| copied posts | social | `duplicateShare` | 0.6 | 10 |
| price jump | market | `return` | 0.05 | 20 |
| price jump | market | `return` | 0.15 | 35 |
| traded volume | market | `volume` | 100000 | 10 |
| traded volume | market | `volume` | 1000000 | 20 |
| volume surge | market | `volumeRatio` | 5 | 10 |
| volume surge | market | `volumeRatio` | 20 | 20 |
| news coverage | catalyst | `newsOutlets6h` | 1 | -10 |
| news coverage | catalyst | `newsOutlets6h` | 3 | -20 |
| 8-K filing | catalyst | `filings24h` | 1 | -20 |
| catalyst before the move | catalyst | `catalystPrecededMove` | 1 | -15 |

The positive maximum is 65 (social) + 75 (market) = 140, so many signals together saturate at 100. The largest catalyst reduction
is 20 + 20 + 15 = 55. Not scored: `mentions`, `trades`, `volatility`, `dollarVolume`, `minutesSinceCatalyst` and the
`item.<code>` counts. The flag's catalyst check (`found`, and the item codes shown) comes from `minutesSinceCatalyst`
and the `item.<code>` features.

`mentionRatio` is mentions divided by a rolling per-ticker baseline once an hour of history exists, otherwise by a
fixed one (`pipeline.baseline-mentions-per-minute` times the window minutes). `volumeRatio` is 1 until there is history.

## Anomaly table (`anomaly-v1`)

For use before labels exist. FeatureStage keeps a running mean and spread of nine features per ticker and window
length in a changelog-backed store (`anomaly-history`) and adds `z.<feature>` = (value - mean) / spread to the
features it emits, once a feature has 30 observations (earlier windows have no `z.` values and score nothing). The
spread is floored at 5% of the mean and z is capped at 10. Each window is judged against the history before it.
The catalyst rows are the same as above.

| Term | Group | Feature | At least | Points |
| --- | --- | --- | --- | --- |
| mention surge | social | `z.mentionRatio` | 3 | 20 |
| mention surge | social | `z.mentionRatio` | 5 | 35 |
| broad chatter | social | `z.distinctAuthors` | 3 | 5 |
| broad chatter | social | `z.distinctAuthors` | 5 | 10 |
| new accounts | social | `z.newAccountShare` | 3 | 5 |
| new accounts | social | `z.newAccountShare` | 5 | 10 |
| copied posts | social | `z.duplicateShare` | 3 | 5 |
| copied posts | social | `z.duplicateShare` | 5 | 10 |
| price jump | market | `z.return` | 3 | 20 |
| price jump | market | `z.return` | 5 | 35 |
| traded volume | market | `z.volume` | 3 | 10 |
| traded volume | market | `z.volume` | 5 | 20 |
| volume surge | market | `z.volumeRatio` | 3 | 10 |
| volume surge | market | `z.volumeRatio` | 5 | 20 |
| news coverage | catalyst | `newsOutlets6h` | 1 | -10 |
| news coverage | catalyst | `newsOutlets6h` | 3 | -20 |
| 8-K filing | catalyst | `filings24h` | 1 | -20 |
| catalyst before the move | catalyst | `catalystPrecededMove` | 1 | -15 |

Overlapping hopping windows are not independent samples, so the history understates the true spread and z-scores run
high; that is why the z thresholds are 3 and 5 rather than the textbook values.

## Contributors (occlusion)

Contributors on a flag come from feature-group occlusion, the same for either scorer and for any later model: the
window is scored again with one group reset to quiet (social, market or catalyst), and the drop is that group's
contribution. Quiet means 0, except `volumeRatio` = 1 and `minutesSinceCatalyst` = 1440, and `z.` and `item.` values
removed. Groups with no effect are left out; the rest are sorted by size of effect, largest first. A catalyst group
that lowered the score has a negative contribution. Contributions need not sum to the score (the cap and the floor
make the scorer non-additive).

## Health and stale sources

- `ScorerHealth` (Actuator `health` and Micrometer `pumpwatch.scorer.scored`, `.dropped`, `.stale`) reports the model
  version, windows scored, unreadable inputs dropped, and scores that carried a stale-source marker.
- Each connector publishes its health every 15 seconds to the `source-health` topic (key = connector name, value =
  `SourceHealth`). The scorer keeps the latest report per source in a global store. When a source's latest report is
  unhealthy and its unhealthy spell began at least `pipeline.stale-after` (default 5 minutes) before the window end,
  the score's `staleSources` contains the connector name (`bluesky` for social features, `alpaca` for market). Scoring
  continues from the other sources.
