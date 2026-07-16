import { NextResponse } from "next/server";
import { fetchLiveTokenPages, ROBINHOOD_CHAIN_ID } from "@/lib/apestore";

export const dynamic = "force-dynamic";

// MC list: fetch 15 pages (360 tokens) directly from ape.store, no cache.
// Users who want a token not in this list can search by CA.
export async function GET() {
  try {
    const tokens = await fetchLiveTokenPages(ROBINHOOD_CHAIN_ID, 15, "0");

    const result = tokens
      .filter((t) => !t.isDead && t.marketCap >= 5_000)
      .sort((a, b) => b.marketCap - a.marketCap);

    return NextResponse.json({ items: result, total: result.length });
  } catch (err) {
    console.error("[/api/tokens]", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
