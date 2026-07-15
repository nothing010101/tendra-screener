// Server-only Alchemy JSON-RPC client, scoped to Robinhood Chain via the
// ALCHEMY_RPC secret. Used for Phase 4 (wallet funding trace).

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
  const body = await res.json();
  if (body.error) {
    throw new Error(`Alchemy RPC ${method} error: ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  return body.result as T;
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
