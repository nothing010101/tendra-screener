import { NextRequest, NextResponse } from "next/server";
import { ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import { getLaunchCountsByCreators } from "@/lib/walletLaunches";

export const dynamic = "force-dynamic";

// Batched lookup used by the screener list: given ?creators=a,b,c returns how
// many tokens (from our recorded history) each creator has launched, so the
// table can flag "serial dev" wallets without an N+1 request per row.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const creators = (searchParams.get("creators") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (creators.length === 0) {
    return NextResponse.json({});
  }

  try {
    const counts = await getLaunchCountsByCreators(ROBINHOOD_CHAIN_ID, creators);
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[/api/wallet/launch-counts]", err);
    return NextResponse.json({}, { status: 200 });
  }
}
