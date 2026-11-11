# Owner review: policy decisions

All decisions are answered (owner review 2026-11-11). Answers are in `decisions.json`; they are shown under each policy below.
A row is used only when every policy covering it is true. The row's `policy` column says which ones.

## suspension_windows: 30 rows

Count SEC trading-suspension windows as pump episodes? (The dates are the suspension period, and a suspension is not a finding.)

Current answer: `False`. Examples:

- P002 GWPD (2019-03-12 to 2019-08-27): https://www.sec.gov/files/litigation/suspensions/2019/34-87203-o.pdf
- P005 LITH (2019-10-01 to 2020-04-08): https://www.sec.gov/files/litigation/suspensions/2020/34-88607-o.pdf
- P006 ARYC (2020-03-02 to 2020-04-13): https://www.sec.gov/files/litigation/suspensions/2020/34-88623-o.pdf

## long_windows: 7 rows

Keep pump windows longer than 60 days, trimmed to their first 30 days?

Current answer: `True`. Examples:

- P001 KVMD (2017-11-29 to 2018-03-16): https://www.sec.gov/files/litigation/complaints/2018/comp24201.pdf
- P002 GWPD (2019-03-12 to 2019-08-27): https://www.sec.gov/files/litigation/suspensions/2019/34-87203-o.pdf
- P015 ASTA (2021-07-27 to 2021-09-28): https://www.sec.gov/files/secondamendedcomplaint21-cv-08739gallagher.pdf

## order_date_ends: 7 rows

Use the order date as the end date when the scheme end is not stated?

Current answer: `True`. Examples:

- P005 LITH (2019-10-01 to 2020-04-08): https://www.sec.gov/files/litigation/suspensions/2020/34-88607-o.pdf
- P006 ARYC (2020-03-02 to 2020-04-13): https://www.sec.gov/files/litigation/suspensions/2020/34-88623-o.pdf
- P007 PXYN (2020-02-27 to 2020-03-25): https://www.sec.gov/files/litigation/suspensions/2020/34-88479-o.pdf

## approx_dates: 4 rows

Keep pump rows whose dates are month bounds or a year-end placeholder?

Current answer: `False`. Examples:

- P034 VISL (2021-02-01 to 2021-03-31): https://www.sec.gov/files/litigation/complaints/2022/comp-pr2022-221.pdf
- P036 ONPH (2021-01-19 to 2021-12-31): https://www.sec.gov/files/litigation/complaints/2023/comp25745.pdf
- P052 OST (2025-04-15 to 2025-06-26): https://www.justice.gov/opa/pr/co-ceo-chinese-publicly-traded-technology-company-and-financial-advisor-indicted-over-100m

## hype_unenforced: 16 rows

Count heavily hyped tickers with no enforcement action found as hype_no_manipulation negatives?

Current answer: `True`. Examples:

- H003 KOSS (2021-01-22 to 2021-01-26): https://urbanmilwaukee.com/2021/01/27/koss-stock-up-over-1000-in-three-days/
- H005 EXPR (2021-03-01 to 2021-03-31): https://www.fool.com/investing/2021/04/05/why-express-stock-skyrocketed-494-in-march
- H006 SNDL (2021-02-08 to 2021-02-11): https://www.fool.com/investing/2021/02/10/why-sundial-growers-stock-skyrocketed-today

## news_mover_caveats: 5 rows

Keep news-mover rows whose catalyst timing, size or deal status is soft (after-close news, term sheet, label change, nano-cap, COVID)?

Current answer: `False`. Examples:

- N003 SLNO (2025-03-26 to 2025-03-27): https://www.sec.gov/Archives/edgar/data/1484565/000119312525064140/d833373dex991.htm
- N008 LSTA (2026-01-21 to 2026-01-21): https://www.sec.gov/Archives/edgar/data/320017/000032001726000006/ex991to8-kkuvajanuary2026.htm
- N009 ELSE (2026-04-21 to 2026-04-21): https://www.electro-sensors.com/news-events/news-applications/electro-sensors-inc-acquired-by-steute-technologies

## one_off: 1 rows (row by row)

| id | ticker | why | link | answer |
| --- | --- | --- | --- | --- |
| P008 | NMGX | SEC suspension over coronavirus-patent claims circulating about Nano Magic since 2020-02-24; end is order date; later vacated. | https://www.sec.gov/files/litigation/suspensions/2020/34-88789-o.pdf | `False` |

## Gate status by outcome

| outcome | pump | news_mover | hype_no_manipulation | control | gate |
| --- | --- | --- | --- | --- | --- |
| all yes | 62 | 25 | 20 | 20 | pass |
| all no | 22 | 20 | 4 | 20 | fail: hype_no_manipulation |
| **current decisions** | 28 | 20 | 20 | 20 | pass |

Why each answer: see [DECISIONS.md](DECISIONS.md).
