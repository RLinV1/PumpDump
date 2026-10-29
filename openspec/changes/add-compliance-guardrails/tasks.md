## 1. Register and audit

- [ ] 1.1 Create `docs/data-sources.md` with one row per source: plan, limit, terms link, last verified date, status (verified or unverified)
- [x] 1.2 Create `docs/free-use-audit.md` recording the audit findings and the evidence for each
- [ ] 1.3 Add a test that fails when a configured source has no register entry or a stale verification date

## 2. Free-tier defaults

- [x] 2.1 Add per-source plan and limit settings to configuration, defaulting to the free plan
- [x] 2.2 Refuse to start a stream whose watchlist exceeds the plan's symbol limit
- [x] 2.3 Log each source's active plan at startup

## 3. Rate limits and identification

- [x] 3.1 Add a shared rate limiter per source set below its published limit
- [x] 3.2 Send a descriptive client name where a source requires it, configured from the environment

## 4. Storage and public output

- [ ] 4.1 Reduce social content at ingestion to the derived fields and drop raw text by default
- [ ] 4.2 Purge stored records when a source reports a deletion
- [ ] 4.3 Add API and page tests that no raw post text or author names are returned or shown

## 5. License gate

- [ ] 5.1 Add a CI job listing npm, Maven and Python licenses and failing on non-commercial, share-alike or unknown
- [ ] 5.2 Require a license field in every model card and check it in the gate
- [ ] 5.3 Add the license list for the web app to the audit file

## 6. Notices

- [ ] 6.1 Add the not-advice notice to every score, flag and alert
- [ ] 6.2 State the non-commercial status and the not-advice notice on the landing page
