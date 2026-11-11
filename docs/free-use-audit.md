# Free-use audit

Audit of whether every dependency, data source and model in Pumpwatch is free to use, for a non-commercial portfolio project. Done on 2026-10-22. This is a record of what was checked and what could not be, not legal advice. Anything marked unverified must be read from the official terms before it is relied on.

## Result in one line

Everything can run at no cost for a non-commercial portfolio project, but four things need care: social data terms (and the fact that free sources give no historical social data to train on), one model that must not be used, a market-data plan that covers only a small live watchlist, and several terms that could not be read from official pages.

## Web app packages (verified from the lockfile)

| Item | License | Notes |
| --- | --- | --- |
| next, react, react-dom, lenis | MIT | Free. |
| tailwindcss and build tooling | MIT, Apache-2.0 | Free. |
| gsap (with ScrollTrigger, SplitText, MotionPath) | GSAP "Standard no charge" license | Free for commercial use. A prohibited-use clause targets tools that compete with Webflow's visual animation builder, which does not apply here. Verified from the vendor's announcement and license page in search results. |
| sharp-libvips (optional, pulled in by Next) | LGPL-3.0 | Optional, dynamically linked and unused because the site uses no image optimizer. Fine. |
| caniuse-lite | CC-BY-4.0 | Data used by build tooling, attribution only. Fine. |
| Fonts (Instrument Sans, JetBrains Mono) | SIL Open Font License | Self-hosted by Next. Free. Not re-verified in this audit. |
| Vanta, three.js | MIT | Removed from the project. |

### Production license list (`scripts/license-gate.sh npm`, run 2026-11-10)

59 packages (production dependencies of `web/`, resolved from the lockfile): 31 MIT, 12 BSD-3-Clause, 8 Apache-2.0, 3 ISC, 1 0BSD, 1 (MIT OR CC0-1.0), 1 CC-BY-4.0 (caniuse-lite), 1 Apache-2.0 AND LGPL-3.0-or-later (sharp-libvips, optional, see above), 1 GSAP standard license (allow-listed in `scripts/license-allow.txt`). No non-commercial, share-alike or unknown licenses. CI re-runs the gate on every push and fails on a new one; model cards must list their licenses and are checked by the same gate (`license-gate.sh cards`).

## Data sources

Drafted 2026-11-11 from official pages; owner to confirm. Rows below were re-checked on 2026-11-11 unless they say otherwise.

| Source | Free plan | Verified how | Caveats |
| --- | --- | --- | --- |
| SEC EDGAR | Free | Checked 2026-11-11: [accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) (10 requests per second, descriptive User-Agent, automated crawling outside policy is managed) and [sec.gov privacy and policies](https://www.sec.gov/privacy.htm) (public information, may be copied and redistributed, cite the SEC) | Stay well under the limit. Do not use SEC logos or imply endorsement. No AI-training rule found. Verified. |
| Alpaca market data | Free plan: IEX only, 30 live symbols, historical limited to data older than 15 minutes, 200 calls per minute | Checked 2026-11-11: [plan docs](https://docs.alpaca.markets/us/docs/about-market-data-api), [News API reference](https://docs.alpaca.markets/us/reference/news-3), [Terms and Conditions](https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf) | Terms limit Content to personal, non-commercial use and bar copying, republishing or public display without consent; making it available through your own app needs 30 days of notice. Storage and model training are not addressed. News: provider not named (articles list sources such as benzinga), plan not stated, no redistribution terms, no numeric limit. Volume is understated because it is one venue. News still unverified. |
| Finnhub | Free key; 30 calls per second on every plan, the free per-minute figure (60 reported) is not on a page I could read | Checked 2026-11-11: [Terms of Service](https://finnhub.io/terms-of-service), [rate limits](https://finnhub.io/docs/api/rate-limit). The [pricing page](https://finnhub.io/pricing) showed no plan details. | Plans are personal use only. No redistribution of data or derived results; data must be deleted when the subscription ends. No AI-training rule found. Keep recorded Finnhub items local. Partly verified. |
| Reddit data API | Free tier reported for non-commercial use, about 100 queries per minute with OAuth | Checked 2026-11-11: official pages (`support.reddithelp.com` help articles, `redditinc.com`, `www.reddit.com/wiki/api`) returned HTTP 403 or were blocked. Third-party sources only. | Not implemented. Reported rules: new API tokens need approval, scraping needs consent, training on Reddit content needs rightsholder permission, commercial use needs a contract. Treat as live-scoring only. Unverified. |
| Google Gemini API (free tier) | Free tier; limits vary by model and are shown in AI Studio, no numbers on the page | Checked 2026-11-11: [rate limits](https://aistudio.google.com/docs/rate-limits), [terms](https://aistudio.google.com/docs/terms) (the ai.google.dev URLs redirect here) | On unpaid services Google may use prompts and responses to improve its products and models, and humans may read them. Terms bar using the service to build competing models. Send no real keys, positions or private data. Used in `research/src/portfolio_risk/agent/client.py`. |
| X (Twitter) API | Reported as paid, pay-per-use since February 2026 | Third-party sources only | Not free. Disabled by default. |
| StockTwits API | Unclear | Directory sites only | Whether new developers can register in 2026 could not be confirmed. Check the official developer page. |
| Bluesky Jetstream and public AppView search | Free public firehose and public endpoint, no login | Checked 2026-11-11: [Jetstream docs](https://bsky.network/docs/jetstream/) (public instances, up to 100 collections and 10,000 DIDs per subscription, at-least-once delivery), [rate-limit docs source](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/rate-limits.md) (AppView limits called generous, no number), [developer guidelines source](https://github.com/bluesky-social/bsky-docs/blob/main/docs/support/developer-guidelines.md), [Terms of Service](https://bsky.social/about/support/tos). The docs.bsky.app and bsky.network rendered guideline pages returned only a heading. | Guidelines require a way to delete content users ask to remove. Terms do not address storage, scraping or AI training by third parties. Not guaranteed stable. Code keeps text off records by default (`BLUESKY_RETAIN_TEXT=false`) but the web shows short capped snippets. Storage and training rules unverified. |
| Press-release feeds | Free public feeds; no feed URLs configured in the repo | Checked 2026-11-11: [PR Newswire terms](https://www.prnewswire.com/terms-of-use/). GlobeNewswire and Business Wire terms returned HTTP 403. | PR Newswire bars automated access, data mining, republishing, commercial use and AI training. Do not enable it without permission. Other two unverified. |

## Models

Drafted 2026-11-11 from official pages; owner to confirm.

| Model | License | Decision |
| --- | --- | --- |
| ProsusAI/finbert | CC BY-NC-SA 4.0 (verified on the model page) | Do not use. Non-commercial and share-alike, so it is not free to use in general. |
| sentence-transformers/all-MiniLM-L6-v2 | Apache-2.0 (verified on the model page) | Use for embeddings. |
| LightGBM, scikit-learn, ONNX Runtime | MIT, BSD, MIT | Use. Standard licenses, not re-verified in this audit. |
| FinTwitBERT-sentiment and kingsman34 ONNX conversion | MIT in both model cards, re-checked 2026-11-11 ([ONNX](https://huggingface.co/kingsman34/FinTwitBERT-sentiment-ONNX), [original](https://huggingface.co/StephanAkkerman/FinTwitBERT-sentiment)) | Pinned local financial-post inference. Training-data licenses are not stated on the card. Conversion provenance recorded in the sentiment evaluation report. |
| CardiffNLP irony and Xenova ONNX conversion | No license declared on either model page, re-checked 2026-11-11 ([Xenova](https://huggingface.co/Xenova/twitter-roberta-base-irony), [CardiffNLP](https://huggingface.co/cardiffnlp/twitter-roberta-base-irony)). Trained on TweetEval; the card asks for citation. | Local evaluation/inference requested by the owner. Verify the weight redistribution terms before publishing container images containing these assets; no public image is published by this work. **Owner decision 2026-11-11: keep.** Inference only in a non-commercial project. The web image bakes the weights in, so push it only to private registries (the manual AWS workflow uses private ECR), never a public one. Replace it (for example, drop the irony tag) if the project goes commercial or an image is published. |
| Financial DistilRoBERTa (`Xenova/distilroberta-finetuned-financial-news-sentiment-analysis` and original [mrm8488](https://huggingface.co/mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis)) | Original: Apache-2.0. The Xenova ONNX copy declares no license. Checked 2026-11-11. | Pinned local news sentiment. The original was trained on Financial PhraseBank, whose dataset card says CC BY-NC-SA 3.0; fine for this non-commercial project, but do not publish the weights in an image without checking. **Owner decision 2026-11-11: keep.** Same conditions as the irony model: private registries only. Replace it (for example, score headlines with FinTwitBERT, MIT) if the project goes commercial or an image is published. |
| Claude or other paid model APIs | Paid | Not used in the project, to stay free. |

## Infrastructure

| Item | Cost | Note |
| --- | --- | --- |
| Kafka, Postgres, Spring Boot | Open source (Apache-2.0, PostgreSQL license) | Free. Not re-verified in this audit. |
| Docker | Free for personal use and small business | Fine for this project. |
| GitHub, GitHub Actions | Free for public repositories | Fine. |
| Terraform | Source-available license (BSL), allows non-competing use | Prefer OpenTofu, which is open source. |
| LocalStack | Student plan is free | Local rehearsal only. |
| AWS EC2 | Costs money unless covered by a free allowance or credits | One small instance for a few hours. Use a budget alarm and destroy after the proof run. |

## Actions

1. Read the official terms for Reddit, Finnhub and Alpaca's news product before relying on them, and record the date in `data-sources.md`.
2. Keep to derived data for social content and show no raw posts publicly.
3. Do not use FinBERT. Use an Apache-2.0 embedding model instead.
4. Keep the watchlist at or below 30 symbols on the free market-data plan.
5. Add the license gate and the source register as CI checks (see `add-compliance-guardrails`).
