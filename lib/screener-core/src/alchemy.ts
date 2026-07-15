// Server-only Alchemy JSON-RPC client, scoped to Robinhood Chain via the
// ALCHEMY_RPC secret. Shared between the Next.js app (funding trace, holder
// count) and the standalone worker (periodic holder-count refresh) so both
// talk to Alchemy through the exact same client.

export interface AlchemyAssetTransfer {
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  metadata: { blockTimestamp: string };
}

async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  const url = process.env.ALCHEMY_RPC;
  if (!url) throw new Error("ALCHEMY_RPC is not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Alchemy RPC ${method} failed (${res.status})`);
  }
  const body = (await res.json()) as { error?: { message?: string }; result: T };
  if (body.error) {
    throw new Error(`Alchemy RPC ${method} error: ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  return body.result;
}

// First N unique buyer addresses for a token — used by the bundler-detection
// endpoint to find who received tokens in the earliest transfers after launch.
// Returns wallet addresses in chronological order, capped at `maxBuyers`.
export async function getEarlyBuyers(tokenAddress: string, maxBuyers = 30): Promise<string[]> {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const result = await alchemyRpc<{ transfers: AlchemyAssetTransfer[] }>(
    "alchemy_getAssetTransfers",
    [{ contractAddresses: [tokenAddress], category: ["erc20"], order: "asc", maxCount: "0x3e8" }],
  );
  const seen = new Set<string>();
  for (const t of result.transfers ?? []) {
    const to = t.to?.toLowerCase();
    if (to && to !== ZERO) {
      seen.add(to);
      if (seen.size >= maxBuyers) break;
    }
  }
  return Array.from(seen);
}

// Earliest incoming native/internal transfers to `address` — used to find who
// funded a wallet before it started deploying tokens. `order: "asc"` +
// small `maxCount` gets us the earliest activity without paging through the
// wallet's full history.
export async function getEarliestIncomingTransfers(address: string, maxCount = 5): Promise<AlchemyAssetTransfer[]> {
  const result = await alchemyRpc<{ transfers: AlchemyAssetTransfer[] }>("alchemy_getAssetTransfers", [
    {
      toAddress: address,
      category: ["external", "internal"],
      order: "asc",
      maxCount: `0x${maxCount.toString(16)}`,
    },
  ]);
  return result.transfers ?? [];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Holder count fallback: ape.store's own `holders` field is always 0 on this
// chain (confirmed empirically across many tokens), so we derive it ourselves
// from every erc20 Transfer of the token contract via Alchemy's asset
// transfers API, netting balances per address (in - out) and counting
// addresses left with a positive balance. Excludes the zero address so
// mints/burns don't get counted as a "holder".
//
// This is a full-history scan, so callers must cache the result (see
// tokenHolders.ts) and refresh on a slow interval — never call this per
// pageview.
export async function computeTokenHolderCount(tokenAddress: string): Promise<number> {
  const balances = new Map<string, number>();
  let pageKey: string | undefined;

  do {
    const params: Record<string, unknown> = {
      contractAddresses: [tokenAddress],
      category: ["erc20"],
      order: "asc",
      maxCount: "0x3e8", // 1000 per page — these are low-activity, freshly launched tokens
    };
    if (pageKey) params.pageKey = pageKey;

    const result = await alchemyRpc<{ transfers: AlchemyAssetTransfer[]; pageKey?: string }>(
      "alchemy_getAssetTransfers",
      [params],
    );

    for (const transfer of result.transfers ?? []) {
      const value = transfer.value ?? 0;
      if (value <= 0) continue;
      const from = transfer.from?.toLowerCase();
      const to = transfer.to?.toLowerCase();
      if (from && from !== ZERO_ADDRESS) {
        balances.set(from, (balances.get(from) ?? 0) - value);
      }
      if (to && to !== ZERO_ADDRESS) {
        balances.set(to, (balances.get(to) ?? 0) + value);
      }
    }

    pageKey = result.pageKey;
  } while (pageKey);

  // Tiny floating-point dust (e.g. -1e-15 from repeated add/subtract) should
  // not count as "still holding" — require a small positive epsilon.
  const EPSILON = 1e-9;
  let holders = 0;
  for (const balance of Array.from(balances.values())) {
    if (balance > EPSILON) holders++;
  }
  return holders;
}
