import { NextRequest, NextResponse } from "next/server";
import { getLiveTokens } from "@/lib/tokenData";
import { ROBINHOOD_CHAIN_ID } from "@/lib/apestore";
import type { SortKey, SortOrder } from "@/lib/tokenData";

export const dynamic = "force-dynamic";

// ─── Holder counts ────────────────────────────────────────────────────────────
// Fetch ALL rows from token_holders for one chain in a single query (no .in()
// address list — avoids the 414 URL-length bug).  token_holders only contains
// rows that have been computed (~136 rows), so this is a very small payload.
interface HolderRow {
  token_address: string;
  holder_count:  number;
  computed_at:   string;
}

async function getHolderCountsByChain(chain: number): Promise<Map<string, HolderRow>> {
  const url = process.env.SUPABASE_URL_PROJECT ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return new Map();

  const params = new URLSearchParams({
    chain:  `eq.${chain}`,
    select: "token_address,holder_count,computed_at",
  });

  const res = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/token_holders?${params.toString()}`,
    {
      headers: {
        apikey:        key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    console.error("[/api/tokens] getHolderCountsByChain HTTP", res.status);
    return new Map();
  }

  const rows: HolderRow[] = (await res.json()) ?? [];
  const map = new Map<string, HolderRow>();
  for (const r of rows) map.set(r.token_address.toLowerCase(), r);
  return map;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────
// Map Supabase snake_case row → camelCase shape the UI already understands.
// Receives a pre-built holderMap so the holder lookup is O(1) per token.
function rowToItem(
  row: Awaited<ReturnType<typeof getLiveTokens>>[number],
  holderMap: Map<string, HolderRow>,
) {
  const h = holderMap.get(row.address.toLowerCase());
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
    // Populated from token_holders if computed; null = not yet computed (N/A)
    holderCount:     h?.holder_count ?? null,
    holderUpdatedAt: h?.computed_at  ?? null,
    last_seen_at: row.last_seen_at,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSort  = searchParams.get("sort")  ?? "marketCap";
  const rawOrder = searchParams.get("order") ?? "desc";

  // Validate params so we never pass arbitrary strings to Supabase
  const VALID_SORTS:  SortKey[]  = ["marketCap", "volume", "newest", "name"];
  const VALID_ORDERS: SortOrder[] = ["asc", "desc"];
  const sort:  SortKey  = VALID_SORTS.includes(rawSort  as SortKey)  ? (rawSort  as SortKey)  : "marketCap";
  const order: SortOrder = VALID_ORDERS.includes(rawOrder as SortOrder) ? (rawOrder as SortOrder) : "desc";

  // mode=new  → 50 newest tokens (deploy_date DESC, limit 50)
  // mode=mc   → all tokens with market_cap >= $5 K (market_cap DESC, no limit)
  const rawMode = searchParams.get("mode") ?? "new";
  const mode = rawMode === "mc" ? "mc" : "new";

  try {
    const [rows, holderMap] = await Promise.all([
      mode === "new"
        ? getLiveTokens(ROBINHOOD_CHAIN_ID, "newest", "desc", "", 50)
        : getLiveTokens(ROBINHOOD_CHAIN_ID, "marketCap", "desc", "", undefined, 5_000),
      getHolderCountsByChain(ROBINHOOD_CHAIN_ID),
    ]);
    const items = rows.map((r) => rowToItem(r, holderMap));
    void sort; void order;
    return NextResponse.json({ items, total: items.length, mode });
  } catch (err) {
    console.error("[/api/tokens]", err);
    return NextResponse.json(
      { error: "Failed to load tokens", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
