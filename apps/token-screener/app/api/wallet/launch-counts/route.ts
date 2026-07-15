import { NextRequest, NextResponse } from "next/server";
import { ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import { getLaunchCountsByCreators } from "@/lib/walletLaunches";

export const dynamic = "force-dynamic";

// Batched lookup used by the screener list: POST body { creators: string[] }
// returns how many tokens each creator has launched (per our recorded history).
// Using POST avoids the 414 Request-URI Too Large that a GET with 2000+ addresses
// in the query string would hit on Cloudflare in front of Supabase.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const creators: string[] = Array.isArray(body.creators) ? body.creators : [];

    if (creators.length === 0) {
      return NextResponse.json({});
    }

    const counts = await getLaunchCountsByCreators(ROBINHOOD_CHAIN_ID, creators);
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[/api/wallet/launch-counts]", err);
    return NextResponse.json({}, { status: 200 });
  }
}
