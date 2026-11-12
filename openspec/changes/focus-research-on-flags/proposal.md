## Why

Pumpwatch is a pump-and-dump detector. The `research/` service (the older app "Plutus") pulled it toward a trading product: a paper-trading tab, order commands and an assistant that could read a paper account. The owner decided to keep the detector identity.

## What changes

- Keep stock search: `LOOK`/`DES`, panel 7 and the `/api/v1/lookup` route stay as they are.
- Remove paper trading end to end: the `/paper` tab, `BUY`/`SELL`/`PT`/`PT RESET` commands, the palette entry, `/api/v1/paper/*`, the ledger and its SQLite storage, the `researchpaper` volume, the `get_paper_*` assistant tools and their tests, docs and screenshot.
- Keep the assistant but scope it to flags:
  - Each flag on `/live` gets an "Ask about this flag" action that opens the chat widget with that ticker's score and evidence as context (an optional `context` string, 600 characters, validated in the web door and the service).
  - The system prompt and mock agent explain why a ticker is or is not flagged and what the evidence means, frame everything as risk detection, and decline buy, sell or hold questions.
  - The widget still answers general questions about a ticker's risk without a flag. The palette entry reads "Ask about a flag".
- Evals: add an explain-a-flag case and a refuse-advice case; drop the paper account case.

## Impact

- Supersedes `add-paper-trading-lookup`: its stock lookup requirement stays, its paper-trading requirements are removed (see the spec delta).
- Anonymous paper accounts already stored in the `researchpaper` volume are no longer read. Remove the volume by hand if it exists.

## Verification

Web: `npm test`, `npm run lint`, `npm run build`. Research: `pytest -q` and `python -m evals.run_evals --agent mock`. Grep for `paper` leaves only unrelated hits.
