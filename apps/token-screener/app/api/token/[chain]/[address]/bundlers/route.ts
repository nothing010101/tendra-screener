import { NextRequest, NextResponse } from "next/server";
import { getEarlyBuyers, getEarliestIncomingTransfers, getTokenBalance } from "@/lib/alchemy";
import { isBridgeOrExchange, BRIDGE_FANOUT_THRESHOLD } from "@/lib/bridgeWhitelist";
import { getBundlerCache, setBundlerCache } from "@/lib/bundlerCache";

export const dynamic = "force-dynamic";

const MAX_BUYERS  = 30;
const CONCURRENCY = 5;
const CHAIN       = 4663;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { address } = await params;

  if (!process.env.ALCHEMY_RPC) {
    return NextResponse.json({ error: "ALCHEMY_RPC not configured" }, { status: 503 });
  }

  try {
    // ── 1. Try permanent cache (early buyers + funders never change) ──────────
    let earlyBuyers: string[];
    let funderMap: Record<string, string | null>;

    const cached = await getBundlerCache(CHAIN, address);

    if (cached) {
      // Cache hit — zero Alchemy calls for the expensive part
      earlyBuyers = cached.earlyBuyers;
      funderMap   = cached.funderMap;
    } else {
      // Cache miss — fetch from Alchemy, then store permanently
      earlyBuyers = await getEarlyBuyers(address, MAX_BUYERS);

      if (earlyBuyers.length === 0) {
        return NextResponse.json({ bundles: [], earlyBuyerCount: 0, fromCache: false });
      }

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

      funderMap = Object.fromEntries(withFunders.map(({ buyer, funder }) => [buyer, funder]));

      // Fire-and-forget cache write (don't block response)
      setBundlerCache(CHAIN, address, { earlyBuyers, funderMap });
    }

    // ── 2. Group buyers by shared funder ─────────────────────────────────────
    const byFunder: Record<string, string[]> = {};
    for (const [buyer, funder] of Object.entries(funderMap)) {
      if (!funder) continue;
      (byFunder[funder] ??= []).push(buyer);
    }

    // ── 3. Live balance check — always fresh, never cached ───────────────────
    const TOTAL_SUPPLY = 1_000_000_000;

    const bundles: {
      funder: string;
      buyers: { address: string; status: "holding" | "sold"; holdPct: number }[];
      suppressed: boolean;
    }[] = [];

    for (const [funder, buyers] of Object.entries(byFunder)) {
      if (buyers.length < 2) continue;

      const localFanOut = buyers.length;
      const suppressed  = isBridgeOrExchange(funder, localFanOut >= BRIDGE_FANOUT_THRESHOLD ? localFanOut : 0);

      const buyersWithStatus = await Promise.all(
        buyers.map(async (buyer) => {
          const balance  = await getTokenBalance(address, buyer).catch(() => -1);
          const status: "holding" | "sold" = balance <= 0 ? "sold" : "holding";
          // balance is already in whole-token units (raw / 10^18).
          // Divide by 1B supply to get percentage. Use toFixed(4) precision.
          const holdPct  = balance > 0 ? (balance / TOTAL_SUPPLY) * 100 : 0;
          return { address: buyer, status, holdPct: parseFloat(holdPct.toFixed(4)) };
        }),
      );

      bundles.push({ funder, buyers: buyersWithStatus, suppressed });
    }

    const visibleBundles  = bundles.filter((b) => !b.suppressed);
    const suppressedCount = bundles.length - visibleBundles.length;

    return NextResponse.json({
      bundles: visibleBundles,
      suppressedCount,
      earlyBuyerCount: earlyBuyers.length,
      fromCache: !!cached,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
