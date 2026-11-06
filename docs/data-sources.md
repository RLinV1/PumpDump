# Data sources

Source register (compliance task 1.1). Facts come from `free-use-audit.md` and `resources-needed.md`. "Unverified" means the official terms were not read; read them and update the date before enabling a source.

| Config key | Source | Plan | Limit | Terms link | Last verified | Allows storage | Allows training | Enabled by default |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alpaca | Alpaca market data | Basic (IEX only) | 30 live symbols, latest 15 minutes restricted in historical API, 200 historical calls per minute ([plan docs](https://docs.alpaca.markets/us/docs/about-market-data-api)) | [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) | 2026-10-29 | Retention rights unverified; personal, non-commercial use covered by terms | unverified | no |
| alpaca-news | Alpaca news | Unconfirmed (not stated on any official page read) | unverified | unverified | unverified | unverified | unverified | no |
| sec | SEC EDGAR | Free, no key | 10 requests per second, descriptive User-Agent required | unverified | 2026-10-27 | unverified | unverified | no |
| finnhub | Finnhub | Free key (reported, non-commercial) | 60 calls per minute (reported) | unverified | unverified | unverified | unverified | no |
| rss | Press-release RSS feeds | Free public feeds | unverified | unverified | unverified | unverified | unverified | no |
| reddit | Reddit | Free tier reported for non-commercial use | about 100 queries per minute with OAuth (reported) | unverified | unverified | unverified (derived data only) | no (reported: needs rightsholder permission) | no |
| x | X (Twitter) | Paid (pay-per-use) | not applicable | unverified | 2026-10-27 | unverified | unverified | no |
| stocktwits | StockTwits | Unclear (registration status unconfirmed) | unverified | unverified | unverified | unverified | unverified | no |
| bluesky | Bluesky Jetstream | Free public firehose, no login | no rate limit stated on the pages read | [Developer Guidelines](https://docs.bsky.app/docs/support/developer-guidelines), [Terms of Service](https://bsky.social/about/support/tos) | 2026-10-27 | unverified (Terms license covers Bluesky, not third-party developers) | unverified (Bluesky says it does not train generative AI on user content; no rule for developers found) | no |

Sources are enabled only after their terms are verified and recorded here.

On 2026-10-29 the operator enabled Alpaca market data for local, personal testing. Authenticated IEX REST
reads and the real-time trade subscription succeeded. The linked terms restrict use to personal,
non-commercial purposes and place conditions on making an application available to others; this check
does not establish public redistribution or model-training rights. Other sources remain disabled.
