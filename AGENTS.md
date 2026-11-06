# Agent rules for Pumpwatch

Pumpwatch is a real-time pump-and-dump detector. It is the main feature. Plutus (`plutus/`) adds stock search, paper trading and the research assistant around it.

## Git

- Use Conventional Commits (`feat(web): ...`) and type-prefixed branches (`feat/<slug>`).
- Never add a `Co-Authored-By` trailer or any AI attribution line.
- Never push or merge to `main` directly. Open a PR.
- Commit and push feature branches without asking.

## Data and secrets

- Real Alpaca data and keys stay on the owner's machine.
- Public deployments (VM, Vercel, AWS) and README images use labelled mock data and carry no Alpaca or Gemini key.
- Never print keys or `.env` values, and never commit `.env`.
- Do not run `terraform apply` or create cloud resources. The owner does that.
- The owner signs in to Vercel themselves.

## UI

- Use the amber-on-black terminal style in `web/DESIGN.md`.
- Do not use the Bloomberg name or logo in the UI.

## Checks

- Web, from `web/`: `npm test`, `npm run lint`, `npm run build`.
- Plutus, from `plutus/`: `uv run --python 3.13 --extra dev pytest -q`.
- Evals, from `plutus/`: `python -m evals.run_evals --agent mock`.
- On Git Bash for Windows, set `MSYS_NO_PATHCONV=1` for `docker exec` paths.
- Node resolves `localhost` to `::1`, so use `127.0.0.1` in local scripts.

Plans live in `openspec/changes/`. Add a change there for new behaviour.
