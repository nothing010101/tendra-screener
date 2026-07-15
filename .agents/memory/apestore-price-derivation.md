---
name: ape.store list-endpoint price derivation
description: How to get a correct USD price per token from ape.store's /api/tokens list endpoint, which has no ready-made price field.
---

ape.store's list endpoint (`/api/tokens`) does NOT return a usable USD price. Its
`priceAfter`/`price` fields are raw internal bonding-curve integers on an
undocumented scale — treating them as a display number directly (e.g.
compacting to "87950.97M") produces nonsense. Only the detail endpoint
(`/api/token/:chain/:address`) returns a real `currentPrice`.

However, `marketCap` on the LIST endpoint is already a correct human-readable
USD figure, and empirically `marketCap = currentPrice * totalSupply` with
totalSupply constant at ~1,000,000,000 across every token observed on Robinhood
Chain (the standard pump.fun-style launch supply). So an accurate display price
can be derived from data already in the list response: `price = marketCap /
1_000_000_000` — no per-token detail call needed.

**Why:** avoids either a wrong price display or an expensive N detail-API calls
just to render a price column in a token list/table.

**How to apply:** if a new field pulled from ape.store's list endpoint looks
like a raw/unscaled integer, don't guess a fixed decimal-shift — compare it
against the detail endpoint's equivalent computed field for the same token to
find the real relationship (in this case via marketCap) before trusting any
formatting logic on it.

Also: for very small USD amounts (sub-cent meme-coin prices/volumes), avoid
`toExponential()` — output like "$4.15e-13" reads as broken to users. Use a
fixed-point format with decimals scaled to the magnitude instead.
