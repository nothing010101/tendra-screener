---
name: ape.store holder counts + Vercel outputDirectory mismatch
description: ape.store's holders field is always 0 on Robinhood Chain (need an on-chain fallback); a Replit-built Vite app deployed to Vercel can 404 if outputDirectory isn't set to match the app's custom outDir.
---

**ape.store `holders` field:** confirmed empirically (many tokens, chain 4663) that ape.store's own `holders` field is always `0` — it's not populated server-side, not a fluke on one token. Any feature needing a real holder count must derive it independently; don't retry against ape.store expecting different results.

**Fallback pattern used:** derive holder count from on-chain ERC-20 Transfer history via Alchemy (`alchemy_getAssetTransfers`, category `erc20`, paginated), netting balances per address (in − out) and counting addresses left with a positive balance (excluding the zero address for mint/burn). This is a full-history scan per token — never compute it inline on a request path; cache it (e.g. Supabase table keyed by chain+address with a `computed_at`) and refresh on a slow background interval (a few minutes), recomputing only stale/missing entries.

**Vercel outputDirectory mismatch:** a Vite app scaffolded by Replit's artifact tooling often sets a custom `build.outDir` (e.g. `dist/public`, to separate from a server build) instead of Vite's default `dist`. If the Vercel project is created with the `vite` framework preset and no explicit `outputDirectory`, Vercel assumes `dist` and serves 404 on every path even though the build succeeds — the build logs report `dist/public/index.html` was created, but Vercel never looks there. Fix: `PATCH /v9/projects/:id` with `{"outputDirectory": "<the app's real outDir>"}` (read it out of `vite.config.ts`'s `build.outDir`), then redeploy.

**Why:** both surprised because they look identical to success from the outside — the ape.store field silently returns a valid-looking `0` (not an error), and the Vercel build log shows "Build Completed" with no error even though the deployed site 404s on every route.

**How to apply:** before trusting a third-party API field as "just always this value," check it t across several distinct records first. Before declaring a fresh Vercel deploy done, actually curl the aliased production URL (not just check `readyState: READY`) — a healthy build can still 404 in production if outputDirectory doesn't match the framework's real build output path.
