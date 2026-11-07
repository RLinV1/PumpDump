## Why

Readers need context for Pumpwatch signals alongside stock lookup and paper trading. Restore a read-only research assistant using Gemini, MCP tools and a local RAG library, with a labelled mock fallback that works without keys.

## What changes

- Add ASK and panel 9, a validated and rate-limited web endpoint, and a private Research assistant endpoint.
- Expose read-only research tools through MCP. The assistant cannot place trades.
- Build the seed knowledge library into the service image and gate deterministic mock evals in CI.
- Pass local Gemini settings through Compose; strip Gemini settings and force the mock agent on public deployments.
- Document local configuration and verify search, paper trading, ASK and sentiment in Docker.

## Boundaries

Real data and keys stay local. Keep the existing Financial DistilRoBERTa sentiment model. No cloud resources are created. Vercel route migration is a separate change after this branch is integrated.
