import { NextRequest, NextResponse } from "next/server";
import { getLiveTokens } from "@/lib/tokenData";
import { ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import type { SortKey, SortOrder } from "@/lib/tokenData";

export const dynamic = "force-dynamic";

// Map Supabase snake_case row → camelCase shape the UI already understands.
// This keeps TokenTable / page.tsx type-compatible without a large refactor.
// Holder counts are intentionally omitted here (holderCount: null) — they are
// fetched separately on the token detail page.  The /api/tokens list no longer
// fetches holder counts because passing all 3000+ addresses in a single
// .in() query would hit the same 414 URL-length bug that existed before.
function rowToItem(row: Awaited<ReturnType<typeof getLiveTokens>>[number]) {
  return {
    // Use chain+address as a stable synthetic id (TokenTable uses this as React key)
    id: `${row.chain}_${row.address}`,
    chain:       row.chain,
    address:     row.address,
    name:        row.name,
    symbol:      row.symbol,
    creator:     row.creator,
    logo:        row.logo,
    twitter:     row.twitter,
    telegram:    row.telegram,
    website:     row.website,
    dexPaid:     row.dex_paid,
    isKing:      row.is_king,
    isDead:      row.is_dead,
    chatCount:   row.chat_count,
    marketCap:   row.market_cap ?? 0,
    price:       row.price ?? 0,
    price1H:     row.price_1h != null ? String(row.price_1h) : null,
    price24H:    row.price_24h != null ? String(row.price_24h) : null,
    // deploy_date maps to both createDate and deployDate (ape.store had both)
    createDate:  row.deploy_date ?? row.last_seen_at,
    deployDate:  row.deploy_date ?? row.last_seen_at,
    kingDate:    null,
    launchDate:  null,
    description: null,
    isDead_raw:  row.is_dead,
    isStreaming: false,
    streamViewers: 0,
    hasMap:      false,
    priceAfter:  String(row.price ?? "0"),
    protocol:    30,
    volumeStat:  row.volume_usd != null
      ? { id: 0, mCap: row.market_cap ?? 0, transactions: 0, volume: 0, volumeUSD: row.volume_usd }
      : null,
    // Holder counts are handled by token detail page — omit from list
    holderCount:     null as number | null,
    holderUpdatedAt: null as string | null,
    last_seen_at: row.last_seen_at,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSort  = searchParams.get("sort")  ?? "marketCap";
  const rawOrder = searchParams.get("order") ?? "desc";

  // Validate params so we never pass arbitrary strings to Supabase
  const VALID_SORTS:  SortKey[]  = ["marketCap", "volume", "newest", "name"];
  const VALID_ORDERS: SortOrder[] = ["asc", "desc"];
  const sort:  SortKey  = VALID_SORTS.includes(rawSort  as SortKey)  ? (rawSort  as SortKey)  : "marketCap";
  const order: SortOrder = VALID_ORDERS.includes(rawOrder as SortOrder) ? (rawOrder as SortOrder) : "desc";

  try {
    const rows = await getLiveTokens(ROBINHOOD_CHAIN_ID, sort, order);
    const items = rows.map(rowToItem);
    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[/api/tokens]", err);
    return NextResponse.json(
      { error: "Failed to load tokens", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
