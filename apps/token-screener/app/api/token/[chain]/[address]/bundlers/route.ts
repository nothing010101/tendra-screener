import { NextRequest, NextResponse } from "next/server";
import { getEarlyBuyers, getEarliestIncomingTransfers } from "@/lib/alchemy";

export const dynamic = "force-dynamic";

const MAX_BUYERS = 30;
const CONCURRENCY = 5;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { address } = await params;

  if (!process.env.ALCHEMY_RPC) {
    return NextResponse.json({ error: "ALCHEMY_RPC not configured" }, { status: 503 });
  }

  try {
    const earlyBuyers = await getEarlyBuyers(address, MAX_BUYERS);

    if (earlyBuyers.length === 0) {
      return NextResponse.json({ bundles: [], earlyBuyerCount: 0 });
    }

    // Fetch the earliest ETH funder for each early buyer, in batches.
    const withFunders: { buyer: string; funder: string | null }[] = [];
    for (let i = 0; i < earlyBuyers.length; i += CONCURRENCY) {
      const batch = earlyBuyers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (buyer) => {
          const transfers = await getEarliestIncomingTransfers(buyer, 1).catch(() => []);
          return { buyer, funder: transfers[0]?.from?.toLowerCase() ?? null };
        }),
      );
      withFunders.push(...results);
    }

    // Group buyers by shared funder; only flag groups of ≥2.
    const byFunder: Record<string, string[]> = {};
    for (const { buyer, funder } of withFunders) {
      if (!funder) continue;
      (byFunder[funder] ??= []).push(buyer);
    }

    const bundles = Object.entries(byFunder)
      .filter(([, buyers]) => buyers.length >= 2)
      .map(([funder, buyers]) => ({ funder, buyers }))
      .sort((a, b) => b.buyers.length - a.buyers.length);

    return NextResponse.json({ bundles, earlyBuyerCount: earlyBuyers.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
