import { NextRequest, NextResponse } from "next/server";
import { fetchTokenDetail } from "@/lib/apestore";
import { recordTokenLaunches } from "@/lib/walletLaunches";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { chain: string; address: string } },
) {
  const chain = Number(params.chain);
  if (!Number.isFinite(chain) || !params.address) {
    return NextResponse.json({ error: "Invalid chain or address" }, { status: 400 });
  }

  try {
    const data = await fetchTokenDetail(chain, params.address);
    // Best-effort: record this launch too, in case it's a dead/delisted token
    // missing from the live list bucket.
    recordTokenLaunches([data.token]).catch((err) =>
      console.error("[/api/token/:chain/:address] recordTokenLaunches", err),
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/token/:chain/:address]", err);
    return NextResponse.json(
      { error: "Failed to load token detail from ape.store", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
