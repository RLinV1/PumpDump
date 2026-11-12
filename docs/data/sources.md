# Data sources

Source register (compliance task 1.1). Facts come from `free-use-audit.md` and `resources.md`. "Unverified" means the official terms were not read; read them and update the date before enabling a source. Status is `verified` only when the row has a Terms link and a Last verified date; otherwise it is `unverified`.

| Config key | Source | Plan | Limit | Terms link | Last verified | Status | Allows storage | Allows training | Enabled by default |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alpaca | Alpaca market data | Basic (IEX only) | 30 live symbols, latest 15 minutes restricted in historical API, 200 historical calls per minute ([plan docs](https://docs.alpaca.markets/us/docs/about-market-data-api)) | [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) | 2026-10-29 | verified | Retention rights unverified; personal, non-commercial use covered by terms | unverified | no |
| alpaca-news | Alpaca news | Unconfirmed (not stated on any official page read) | unverified | unverified | unverified | unverified | unverified | unverified | no |
| sec | SEC EDGAR | Free, no key | 10 requests per second, descriptive User-Agent required | unverified | 2026-10-27 | unverified | unverified | unverified | no |
| finnhub | Finnhub | Free key (reported, non-commercial) | 60 calls per minute (reported) | unverified | unverified | unverified | unverified | unverified | no |
| rss | Press-release RSS feeds | Free public feeds | unverified | unverified | unverified | unverified | unverified | unverified | no |
| reddit | Reddit | Free tier reported for non-commercial use | about 100 queries per minute with OAuth (reported) | unverified | unverified | unverified | unverified (derived data only) | no (reported: needs rightsholder permission) | no |
| x | X (Twitter) | Paid (pay-per-use) | not applicable | unverified | 2026-10-27 | unverified | unverified | unverified | no |
| stocktwits | StockTwits | Unclear (registration status unconfirmed) | unverified | unverified | unverified | unverified | unverified | unverified | no |
| bluesky | Bluesky Jetstream | Free public firehose, no login | no rate limit stated on the pages read | [Developer Guidelines](https://docs.bsky.app/docs/support/developer-guidelines), [Terms of Service](https://bsky.social/about/support/tos) | 2026-10-27 | verified | unverified (Terms license covers Bluesky, not third-party developers) | unverified (Bluesky says it does not train generative AI on user content; no rule for developers found) | no |
| bluesky-search | Bluesky public search (AppView `app.bsky.feed.searchPosts`) | Free, no login (public endpoint called by `web/bluesky-search.mjs`) | App-side cap of 30 requests per minute (`web/bluesky-search.mjs`); published limit unverified | unverified | unverified | unverified | unverified | unverified | no (needs `SENTIMENT_ENABLED=true`) |
| huggingface | Hugging Face model hub (FinTwitBERT ONNX, CardiffNLP irony, Financial DistilRoBERTa; pinned revisions in `web/text-models.mjs`) | Free, no key in repo | unverified (no limit in repo; weights cached locally after first download) | unverified | unverified | unverified | unverified | unverified | no (only when `web/scripts/fetch-sentiment-model.mjs` runs) |
| gemini | Google Gemini API (assistant, default model `gemini-3.6-flash` in `research/src/portfolio_risk/config.py`) | Unverified (API key read from `GEMINI_API_KEY`; plan not in repo) | unverified | unverified | unverified | unverified | unverified | unverified | no (used only when `GEMINI_API_KEY` is set; mock agent otherwise) |

Sources are enabled only after their terms are verified and recorded here.

On 2026-10-29 the operator enabled Alpaca market data for local, personal testing. Authenticated IEX REST
reads and the real-time trade subscription succeeded. The linked terms restrict use to personal,
non-commercial purposes and place conditions on making an application available to others; this check
does not establish public redistribution or model-training rights. Other sources remain disabled.
