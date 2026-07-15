import { NextRequest, NextResponse } from "next/server";
import { ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import { getLaunchesByCreator } from "@/lib/walletLaunches";

export const dynamic = "force-dynamic";

// Returns every token we've recorded for this creator address on Robinhood
// Chain (Phase 3 dev-wallet tracking). Includes the token being viewed —
// callers filter it out client-side.
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  if (!params.address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const launches = await getLaunchesByCreator(ROBINHOOD_CHAIN_ID, params.address);
    return NextResponse.json({ creator: params.address.toLowerCase(), launches });
  } catch (err) {
    console.error("[/api/wallet/:address/launches]", err);
    return NextResponse.json(
      { error: "Failed to load wallet launch history", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
