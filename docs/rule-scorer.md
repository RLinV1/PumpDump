# Rule scorer (`rules-v1`)

The transparent scorer that runs before any trained model exists. It reads the features of one window length
(`pipeline.scoring-window-minutes`, default 5) and adds points. `RuleScorerTest` fails if this table and
`RuleScorer.TERMS` differ, so edit both together.

How a term scores: for each term, find the highest row whose feature value is **at least** the threshold; that row's
points are the term's points. A term with no matching row adds nothing. The score is the sum of all terms, capped at
100. A flag needs the score to reach `pipeline.flag-level` (default 60).

| Term | Group | Feature | At least | Points |
| --- | --- | --- | --- | --- |
| mention surge | social | `mentionRatio` | 3 | 20 |
| mention surge | social | `mentionRatio` | 10 | 35 |
| broad chatter | social | `distinctAuthors` | 5 | 5 |
| broad chatter | social | `distinctAuthors` | 20 | 10 |
| price jump | market | `return` | 0.05 | 20 |
| price jump | market | `return` | 0.15 | 35 |
| traded volume | market | `volume` | 100000 | 10 |
| traded volume | market | `volume` | 1000000 | 20 |

The maximum is 35 + 10 + 35 + 20 = 100. There is no catalyst term yet: catalyst features (filings, news) are not
produced by the pipeline skeleton, and the flag's catalyst check is a placeholder (`found=false`). When catalyst
features exist, they will only ever subtract points.

Contributors on a flag are the points per group (social, market), largest first, groups with zero points left out.

`mentionRatio` is mentions divided by a fixed baseline (`pipeline.baseline-mentions-per-minute` times the window
minutes). It is a placeholder until a rolling per-ticker baseline exists.
