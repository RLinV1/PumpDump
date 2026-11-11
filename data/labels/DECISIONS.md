# How the labels were built and what was decided

Owner approved the recommended answers on 2026-11-11. The machine-readable answers are in `decisions.json`; the grouped questions are in `REVIEW.md`; the schema is in `README.md`.

## The four classes

The model has to tell a coordinated pump from things that look similar. Each class teaches it something different.

- **pump**: a stock whose price and volume were pushed up by a promotion or manipulation scheme that a public authority described (SEC or DOJ). This is what the product wants to flag.
- **news_mover**: a big one-day move explained by real news such as earnings, an FDA decision or a takeover. It looks like a pump on a chart but is not one, so the model must learn to score it low.
- **hype_no_manipulation**: heavy retail or social-media excitement where no manipulation action was found. It teaches the model that chatter alone is not proof of a pump.
- **control**: an ordinary quiet period for a similar company. It gives the model a normal baseline.

Training on real labels needs at least 20 episodes in every class (`MIN_PER_CLASS`). With fewer, training is refused instead of producing a model that only looks good.

## How rows were sourced

- **pump**: SEC complaints and litigation releases, SEC trading-suspension orders, and DOJ press releases that name a ticker and give dates. Dates are taken from the document. If a document gives only a month or a vague range, the row is `uncertain`.
- **news_mover**: the company press release or SEC filing (8-K, exhibit 99.1) for the event. Move sizes come from news summaries, not from the primary page.
- **hype_no_manipulation**: a news article describing the hype. A search of sec.gov and justice.gov looked for manipulation actions on the ticker. None was found.
- **control**: the same ticker as a news-mover row, in a quiet fortnight away from its event. The company's filing list on SEC EDGAR was checked: no 8-K, 10-K, 10-Q, S-1, prospectus or deal filing falls in the window. These rows have no URL.

`uncertain` means the dates are approximate, the window is much wider than the likely pump, or a negative could plausibly have been manipulation. Every uncertain row has a `policy` naming the decision below that covers it. A row is trained on only if every policy covering it was answered yes.

## Decisions

| policy | rows | answer | reason |
| --- | --- | --- | --- |
| `suspension_windows` | 30 | no | A trading suspension is a precaution, not a finding of manipulation, and its dates are the suspension window, not the pump window. |
| `long_windows` | 7 | yes, trimmed to the first 30 days | The cases are real, and trimming keeps the window close to the actual promotion and spike. |
| `order_date_ends` | 7 | yes | The case is real; the end date may run a little long, which is acceptable. (All 7 are also suspension-order rows, so the `suspension_windows` answer excludes them for now.) |
| `approx_dates` | 4 | no | Only 4 rows, and month-level dates add more noise than signal. |
| `hype_unenforced` | 16 | yes | "Heavy hype with no enforcement action found" is the definition of this class. Without these rows the class has 4 rows and training is blocked. Caveat: none found is not proof of none. |
| `news_mover_caveats` | 5 | no | 20 well-documented news movers are already enough. |

One-off rows:

- **NMGX (P008): dropped.** The suspension was later vacated.
- **CLOV (H004): kept as hype.** Its SEC and DOJ matter concerned disclosure, not manipulation of the stock. Now `high`, noted as owner reviewed.
- **HKD (H015): kept as hype.** A low-float IPO spike with no charges found. Now `high`, noted as owner reviewed.

## Resulting training set

pump 28, news_mover 20, hype_no_manipulation 20, control 20. Every class meets the minimum of 20 (the report and the gate agree). The 28 pumps are the 22 high-confidence rows plus 6 trimmed long-window rows. Hype sits exactly at the minimum, so dropping any hype row blocks training.

## Known limits

- **Survivorship**: only schemes that were caught appear. The model flags pump-like behavior; it does not prove manipulation.
- **Approximate windows**: enforcement documents often give wider or looser dates than the real spike.
- **Controls**: checked against EDGAR filings only. News with no filing is invisible to that check.
- **Hype searches**: the enforcement search for 13 of the 20 hype tickers was a grouped search, and the other 7 were searched one by one. Search tools return summaries, so "none found" is not proof of none.
- **Fetch gaps**: most justice.gov pages returned empty to the fetcher, so pump rows come almost entirely from SEC pages.
- **Review again** when new enforcement actions appear. A changed label needs a new version in `VERSION.json` with the reason.
