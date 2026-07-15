# Robinhood Chain Screener — dev-wallet tracking worker

Standalone process that keeps `wallet_launches` up to date independent of
website traffic. The Next.js app (`apps/token-screener`) only records a
token launch when someone has the screener page open; this worker polls
ape.store on a fixed interval (default 30s, `POLL_INTERVAL_MS` env var) and
writes through the same `recordTokenLaunches()` used by the app, imported
from `@workspace/screener-core` — no duplicated logic.

## Environment variables (server-side only)

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL_PROJECT` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `POLL_INTERVAL_MS` | Optional, defaults to `30000` (30s) |
| `PORT` | Optional — if set, a trivial `GET /` health check server is started (some hosts require an open port) |

## Running locally

```bash
pnpm install
pnpm --filter @workspace/worker run dev
```

## Deploying to Railway

This is meant to run as an always-on **worker service** (not a serverless
function): install deps, then `pnpm --filter @workspace/worker run start`,
from the repo root, with the two Supabase env vars above configured on the
Railway service. There is no separate build step — it runs the TypeScript
source directly via `tsx`.
