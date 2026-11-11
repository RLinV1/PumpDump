# Source terms and rate limits

Findings from reading the providers' own pages. Companion to the register in [sources.md](sources.md) and the evidence in [free-use-audit.md](free-use-audit.md).

All news and filing sources are off by default. Rate limits are the values configured in
`connectors/src/main/resources`; terms status is copied from [sources.md](sources.md).
The findings below were checked on 2026-11-11 against the providers' own pages. They are drafts
and none of the OpenSpec tasks are ticked until the owner confirms them. This is not legal advice.

Drafted 2026-11-11 from official pages; owner to confirm.

| Source | Env flag | Configured limit | Official limit | Storing items for replay | Terms status (checked 2026-11-11) |
| --- | --- | --- | --- | --- | --- |
| Alpaca News | `ALPACA_NEWS_ENABLED` | 150 requests/min (`alpaca-news.yml`) | Shares the 200 calls/min Basic limit; the news reference states no number and says 429s carry rate-limit headers. Plan not stated. | Not addressed. Alpaca's terms limit all Content to personal, non-commercial use and bar republishing it. Article text comes from named third-party feeds. Unverified. | [News API reference](https://docs.alpaca.markets/us/reference/news-3), [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf). Keep local. Whether news is on the free plan is still unstated. |
| SEC EDGAR 8-K | `SEC_ENABLED` | 300 requests/min (`application.yml`) | 10 requests/s, descriptive User-Agent required ([accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)) | Allowed. sec.gov says its information is public and may be copied or redistributed; asks you to cite the SEC ([sec.gov privacy and policies](https://www.sec.gov/privacy.htm)). | Verified. Do not use SEC logos or imply SEC endorsement. No AI-training rule found. |
| Finnhub | `FINNHUB_ENABLED` | 50 calls/min (`finnhub.yml`) | 30 calls/s on every plan ([rate limits](https://finnhub.io/docs/api/rate-limit)). The free per-minute figure (60 reported) is not on any page I could read. | Not allowed to redistribute data or derived results; data must be deleted when the subscription ends ([Terms of Service](https://finnhub.io/terms-of-service)). Plans are personal use only. No AI-training rule found. | Partly verified. Keep recorded Finnhub news local and never publish it. |
| Press-release RSS | `RSS_ENABLED` | 30 requests/min shared across feeds (`rss.yml`) | None published | PR Newswire: no. Its terms bar automated access and data mining, republishing, commercial use and AI training ([PR Newswire terms](https://www.prnewswire.com/terms-of-use/)). GlobeNewswire and Business Wire terms returned HTTP 403. | No feed URLs are configured in the repo (`RSS_FEEDS` is empty; the three names are only in a comment). Treat PR Newswire as not usable until the owner gets permission; GlobeNewswire and Business Wire unverified. |

Conflicts with current code (no code changed here):

- The recorder keeps every news payload in `recorded_events.payload` (`replay/src/main/resources/db/migration/V1__recorded_events.sql`, `replay/.../EventStore.java`). News records hold headline, URL and tickers only (`common/.../ArticleRecord.java`), no body, which keeps this small. For Finnhub and PR Newswire items it is still storage the terms do not clearly allow, so keep it local.
- `rss.yml` names PR Newswire as a target feed. Its terms forbid automated access to its site; that likely covers its RSS endpoint, so confirm before enabling.

Until the owner confirms these, keep recorded news local and do not replay it publicly.

## Alpaca market data and Reddit: terms findings

Drafted 2026-11-11 from official pages; owner to confirm. Covers tasks 7.1 and 7.2 of `add-ingestion-pipeline`.

**Alpaca market data (7.1).**
- Free (Basic) plan: IEX exchange only, 30 websocket symbols, 200 historical calls per minute, and historical API data limited to the latest 15 minutes ([market data plans](https://docs.alpaca.markets/us/docs/about-market-data-api)). The configured 150 calls/min (`alpaca.yml`) is under the 200 limit.
- Storage and replay: the plan docs and [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) say nothing explicit about storing ticks. They limit Content to personal, non-commercial use and bar copying, republishing or public display without Alpaca's written consent. Making Content available to others through your own app needs 30 days of written notice to Alpaca. No ban on model training was found, and none was stated either.
- So: recording ticks to the local replay database for your own use is consistent with the terms as written, but not confirmed. The public VM and README images must stay on labelled mock data. This matches `AGENTS.md`. Conflict with code: none, as long as `replay` output never leaves the owner's machine (`replay/.../EventStore.java` stores raw tick payloads).

**Reddit Data API (7.2, not implemented).**
- Unverified. Reddit's own pages (`support.reddithelp.com`, `redditinc.com`, `www.reddit.com/wiki/api`) returned HTTP 403 or were blocked from this tool on 2026-11-11, so no official text was read.
- Third-party reports, not confirmed: free tier for approved non-commercial use at about 100 queries/min with OAuth; training models on Reddit content needs permission; commercial use needs a contract; one source says new API access may close on 2026-10-31.
- Keep it disabled. If it is ever built, read the current Data API Terms first, use it for live scoring only, store derived data only and keep its content out of training data. No code uses Reddit today.

