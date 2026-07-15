import { NextRequest, NextResponse } from "next/server";
import { fetchTokenList, ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import { recordTokenLaunches } from "@/lib/walletLaunches";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const search = searchParams.get("search") ?? "";

  try {
    const data = await fetchTokenList({ page, search, chain: ROBINHOOD_CHAIN_ID });
    // Best-effort, non-blocking: build up dev-wallet launch history for Phase 3.
    recordTokenLaunches(data.items).catch((err) => console.error("[/api/tokens] recordTokenLaunches", err));
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/tokens]", err);
    return NextResponse.json(
      { error: "Failed to load tokens from ape.store", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
