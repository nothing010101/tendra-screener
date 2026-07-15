# Robinhood Chain Screener

A token screener for tokens launched on [ape.store](https://ape.store) on **Robinhood Chain** (internal chain id `4663`, an Arbitrum L2). Shows a live, sortable/searchable board (name, symbol, logo, market cap, volume, price) with plans to add per-token detail, dev-wallet tracking, funding trace, and bundle-wallet detection.

## Run & Operate

- `pnpm --filter @workspace/token-screener run dev` — run the screener (Next.js, port 5000)
- `pnpm --filter @workspace/token-screener run build` — production build
- `pnpm --filter @workspace/token-screener run typecheck` — typecheck the screener
- `pnpm --filter @workspace/api-server run dev` — unrelated pre-existing API server artifact (not used by the screener)
- Required env (server-side only): `ALCHEMY_RPC`, `SUPABASE_URL_PROJECT`, `SUPABASE_SERVICE_ROLE_KEY` (used starting Phase 3+; Phase 1 doesn't need them)

## Stack

- `apps/token-screener`: Next.js 14 (App Router) + Tailwind, plain workspace package (NOT a Replit "artifact" — see Gotchas)
- Data source: ape.store's public API (no auth needed), proxied through Next.js API routes
- Supabase (Postgres) planned for Phase 3+ (dev-wallet tracking, funding trace, bundle-wallet flags)
- Alchemy RPC planned for Phase 4+ (on-chain holder counts, wallet funding trace)

## Where things live

- `apps/token-screener/app/page.tsx` — screener list UI (client component: search, sort, 20s polling)
- `apps/token-screener/app/api/tokens/route.ts` — server proxy to ape.store's token list endpoint
- `apps/token-screener/lib/apestore.ts` — all ape.store API calls + response types, centralized here
- `apps/token-screener/lib/i18n/` — EN/ID dictionaries + language context (localStorage-persisted)
- `apps/token-screener/supabase/schema.sql` — Phase 3-5 tables (`wallet_launches`, `wallet_transfers`, `bundle_flags`); applied to the Supabase project
- `apps/token-screener/lib/supabase.ts` — server-only Supabase admin client (service-role key)
- `apps/token-screener/lib/walletLaunches.ts` — Phase 3 dev-wallet tracking: record + query launch history
- `apps/token-screener/app/api/wallet/[address]/launches/route.ts` — all recorded launches for one creator
- `apps/token-screener/app/api/wallet/launch-counts/route.ts` — batched launch counts for a set of creators
- `apps/token-screener/components/DevWalletWarning.tsx` — detail-page warning banner listing a creator's other tokens
- `apps/token-screener/lib/alchemy.ts` — server-only Alchemy JSON-RPC client (`alchemy_getAssetTransfers`) scoped to Robinhood Chain
- `apps/token-screener/lib/walletTransfers.ts` — Phase 4 funding trace: earliest funder lookup (cached in `wallet_transfers`) + funder fan-out count
- `apps/token-screener/app/api/wallet/[address]/funding/route.ts` — funding trace + funder fan-out for one wallet
- `apps/token-screener/components/FundingTrace.tsx` — detail-page section showing who funded the creator wallet and how many other dev wallets that funder has funded

## Architecture decisions

- Built as a real Next.js 14 App Router project per explicit user request, even though it can't be previewed inside Replit's UI (see Gotchas) — user chose to keep it anyway and push to their own GitHub for external dev/deploy (Vercel).
- ape.store list endpoint's `sort`/`order`/`filter` query params have unclear enum semantics; the app always requests `filter=0` (the only bucket returning live data) and does all sorting (market cap/volume/name/newest) client-side for correctness.
- Holder counts are not shown yet — ape.store's `/holders` endpoint returns empty for every Robinhood Chain token tested (chain too new); needs an Alchemy RPC-based fallback, deferred past Phase 1.
- GitHub repo `nothing010101/robinhood-chain-screener` created via the GitHub API using the `GITHUB_TOKEN` secret directly (no GitHub integration/connector was set up — this workspace only had a `gitsafe-backup` internal remote).

## Product

- Phase 1 (done): live screener list — search by name/symbol, sort by market cap/volume/name/newest, 20s auto-refresh, EN/ID language switcher, mobile-responsive dark "trading terminal" UI.
- Phase 2 (done): token detail page (`/token/[chain]/[address]`) with 20s polling auto-refresh, market cap/liquidity/king-progress/ape-progress stats, and a recent-trades table (buy/sell, wallet, amount, time, tx link).
- Phase 3 (done): dev-wallet tracking — every ape.store fetch upserts into `wallet_launches`; the screener table flags "serial dev" creators (⚠ badge) via a batched count lookup, and the token detail page shows a warning banner listing the creator's other tokens on Robinhood Chain.
- Phase 4 (done): wallet funding trace — on a token's detail page, traces the creator wallet's earliest incoming transfer via Alchemy RPC (`alchemy_getAssetTransfers`), caches it in `wallet_transfers`, and warns if that same funder has funded multiple dev wallets on this chain.
- Phase 5 (planned): bundle-wallet heuristic detection, shown as an indication not a fact (`bundle_flags` table).

## User preferences

- User writes briefs in Indonesian; product/UI copy defaults to English with an EN/ID switcher.
- User wants minimal check-ins: proceed through a full phase without stopping for minor approvals, only report at major checkpoints or real blockers (with evidence).
- Explicitly confirmed: keep the app as real Next.js even though it isn't previewable inside Replit's UI; push to their own new GitHub repo using the already-provided `GITHUB_TOKEN`.

## Gotchas

- ape.store detail endpoint's `kingProgress`/`apeProgress` are already 0-100 scale numbers, not 0-1 fractions — don't multiply by 100 again.
- **This app cannot be previewed inside Replit's UI.** This workspace's preview pane/deploy only supports registered "artifact" types (`react-vite`, `expo`, `slides`, `video-js`, `openscad`); Next.js isn't one of them. The dev server runs fine as a plain `configureWorkflow` process on port 5000, but hitting the public Replit dev domain returns "no previewable artifacts" (confirmed via test). Verify changes with `curl http://localhost:5000` from the shell, not with the Screenshot tool.
- ape.store's `volumeStat` list field is an object (`{ mCap, transactions, volume, volumeUSD }`), not a plain number — use `.volumeUSD`.
- Supabase schema (`supabase/schema.sql`) must be run manually in the Supabase SQL editor; there's no service-role/REST path to execute DDL from this repo.
- `wallet_launches` is populated passively (best-effort upsert on every ape.store list/detail fetch), not backfilled — the "serial dev" count is a lower bound based on tokens we've actually observed, not full on-chain history.
- Alchemy's enhanced `alchemy_getAssetTransfers` API works against the `ALCHEMY_RPC` endpoint for Robinhood Chain (chain id `4663` = `0x1237`) — confirmed via direct RPC call. Funding trace uses `order: "asc"` + small `maxCount` to get earliest incoming transfer cheaply instead of paging full history.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- GitHub remote: `origin` → `https://github.com/nothing010101/robinhood-chain-screener` (credentials stored in `~/.git-credentials`, not committed)
