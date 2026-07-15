// Supabase-backed token snapshot table.
//
// The worker upserts every token it sees from ape.store on each 30-second poll
// cycle. The Next.js screener reads from here instead of calling ape.store
// directly — one Supabase query replaces the previous 129-request pagination
// waterfall. ape.store API calls are exclusively the worker's responsibility.

import { getSupabaseAdmin } from "./supabase";
import type { ApeStoreTokenListItem } from "./apestore";

export type SortKey = "marketCap" | "volume" | "newest" | "name";
export type SortOrder = "asc" | "desc";

export interface TokenRow {
  chain: number;
  address: string;
  name: string;
  symbol: string;
  creator: string;
  market_cap: number | null;
  volume_usd: number | null;
  deploy_date: string | null;
  price: number | null;
  price_1h: number | null;
  price_24h: number | null;
  logo: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dex_paid: boolean;
  is_king: boolean;
  is_dead: boolean;
  chat_count: number;
  last_seen_at: string;
}

const SORT_COLUMN: Record<SortKey, string> = {
  marketCap: "market_cap",
  volume:    "volume_usd",
  newest:    "deploy_date",
  name:      "name",
};

// ─── Read ────────────────────────────────────────────────────────────────────

// Sort column names as understood by the Supabase REST ?order= param.
const REST_SORT: Record<SortKey, string> = {
  marketCap: "market_cap",
  volume:    "volume_usd",
  newest:    "deploy_date",
  name:      "name",
};

export async function getLiveTokens(
  chain: number,
  sort: SortKey = "marketCap",
  order: SortOrder = "desc",
  search = "",
): Promise<TokenRow[]> {
  const url  = process.env.SUPABASE_URL_PROJECT ?? "";
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("[tokenData] SUPABASE_URL_PROJECT / SUPABASE_SERVICE_ROLE_KEY not set");
    return [];
  }

  const col       = REST_SORT[sort];
  const direction = order === "asc" ? "asc.nullslast" : "desc.nullslast";

  // Build Supabase REST query directly — bypasses supabase-js client entirely,
  // which avoids module-singleton / bundling issues in Vercel serverless.
  const params = new URLSearchParams({
    "chain":   `eq.${chain}`,
    "is_dead": "eq.false",
    "order":   `${col}.${direction}`,
    "select":  "*",
  });

  if (search.trim()) {
    params.set("or", `(name.ilike.*${search.trim()}*,symbol.ilike.*${search.trim()}*)`);
  }

  const base = `${url.replace(/\/$/, "")}/rest/v1/tokens?${params.toString()}`;
  const PAGE = 1000; // Supabase free-tier max-rows cap per request

  // Fetch a single range page from Supabase REST.
  async function fetchRange(from: number): Promise<TokenRow[]> {
    const res = await fetch(base, {
      headers: {
        apikey:         key,
        Authorization:  `Bearer ${key}`,
        "Content-Type": "application/json",
        // PostgREST Range header for offset pagination.
        "Range":        `${from}-${from + PAGE - 1}`,
        "Range-Unit":   "items",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 416 = Range Not Satisfiable → offset is beyond end of result set.
      if (res.status === 416) return [];
      console.error(`[tokenData] getLiveTokens HTTP ${res.status} (range ${from}):`, body);
      return [];
    }
    return (await res.json() as TokenRow[]) ?? [];
  }

  // First page — always fetched.
  const first = await fetchRange(0);
  if (first.length < PAGE) return first; // fits in one page

  // Still more rows: fan out to fetch remaining pages in parallel.
  // We don't know the total upfront, so fetch up to a generous ceiling
  // (e.g. 10 000 tokens) and stop when a page comes back short.
  const MAX_PAGES = 10;
  const offsets = Array.from({ length: MAX_PAGES - 1 }, (_, i) => (i + 1) * PAGE);
  const rest = await Promise.all(offsets.map(fetchRange));

  const all: TokenRow[] = [...first];
  for (const page of rest) {
    all.push(...page);
    if (page.length < PAGE) break; // last page
  }
  return all;
}

// ─── Write ───────────────────────────────────────────────────────────────────

// Called by the worker on every 30-second poll.  Upserts every token the
// worker sees from ape.store, including is_dead=true rows (kept for history).
export async function upsertTokenSnapshot(
  chain: number,
  items: ApeStoreTokenListItem[],
): Promise<void> {
  // Diagnostic: confirm function is entered and supabase client state
  console.log(`[tokenData] upsertTokenSnapshot() called — items=${items.length}, chain=${chain}`);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("[tokenData] upsertTokenSnapshot() — getSupabaseAdmin() returned null, skipping upsert");
    return;
  }
  if (items.length === 0) {
    console.warn("[tokenData] upsertTokenSnapshot() — items array is empty, skipping upsert");
    return;
  }

  const now = new Date().toISOString();

  // ape.store price field is unreliable on this chain; derive from marketCap /
  // ~1 billion total supply (empirically observed constant for new launches).
  const TOTAL_SUPPLY = 1_000_000_000;

  const rows = items.map((t) => ({
    chain,
    address:      t.address.toLowerCase(),
    name:         t.name,
    symbol:       t.symbol,
    creator:      t.creator.toLowerCase(),
    market_cap:   t.marketCap ?? null,
    volume_usd:   t.volumeStat?.volumeUSD ?? null,
    deploy_date:  t.deployDate ?? null,
    price:        t.marketCap != null ? t.marketCap / TOTAL_SUPPLY : null,
    price_1h:     t.price1H != null ? parseFloat(t.price1H) : null,
    price_24h:    t.price24H != null ? parseFloat(t.price24H) : null,
    logo:         t.logo ?? null,
    twitter:      t.twitter ?? null,
    telegram:     t.telegram ?? null,
    website:      t.website ?? null,
    dex_paid:     t.dexPaid ?? false,
    is_king:      t.isKing ?? false,
    is_dead:      t.isDead ?? false,
    chat_count:   t.chatCount ?? 0,
    last_seen_at: now,
  }));

  // Batch upsert in chunks to stay well under Supabase's 2 MB request limit.
  const CHUNK = 500;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("tokens")
      .upsert(chunk, { onConflict: "chain,address" });
    if (error) {
      console.error(`[tokenData] upsert chunk ${i}–${i + chunk.length} failed:`, error.message);
    } else {
      totalUpserted += chunk.length;
      console.log(`[tokenData] upsert chunk ${i}–${i + chunk.length} OK`);
    }
  }
  console.log(`[tokenData] upsertTokenSnapshot() done — ${totalUpserted}/${rows.length} rows upserted to chain ${chain}`);
}
