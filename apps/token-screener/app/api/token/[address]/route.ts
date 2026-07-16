import { NextRequest, NextResponse } from "next/server";
import { fetchTokenDetail, ROBINHOOD_CHAIN_ID } from "@/lib/apestore";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const address = params.address.trim();
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

  try {
    const detail = await fetchTokenDetail(ROBINHOOD_CHAIN_ID, address);
    // Merge top-level MC (most accurate) into the token object.
    const token = { ...detail.token, marketCap: detail.marketCap };
    return NextResponse.json({ token });
  } catch (err) {
    const msg = String(err);
    const status = msg.includes("404") ? 404 : 502;
    return NextResponse.json({ error: "Token not found", detail: msg }, { status });
  }
}
