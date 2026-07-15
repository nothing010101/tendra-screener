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
  const url  = process.env.SUPABASE_URL_PROJECT;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    "limit":   "10000",
    "select":  "*",
  });

  if (search.trim()) {
    params.set("or", `(name.ilike.*${search.trim()}*,symbol.ilike.*${search.trim()}*)`);
  }

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/tokens?${params.toString()}`;

  const res = await fetch(endpoint, {
    headers: {
      apikey:          key,
      Authorization:   `Bearer ${key}`,
      "Content-Type":  "application/json",
      // Supabase REST caps rows at the project max (often 1 000 on free tier)
      // even when `limit` is larger. Range header overrides that cap.
      "Range":         "0-9999",
      "Range-Unit":    "items",
    },
    // Never cache — data changes every 30 s from the worker.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[tokenData] getLiveTokens HTTP ${res.status}:`, body);
    return [];
  }

  const data = await res.json() as TokenRow[];
  return data ?? [];
}

// ─── Write ───────────────────────────────────────────────────────────────────

// Called by the worker on every 30-second poll.  Upserts every token the
// worker sees from ape.store, including is_dead=true rows (kept for history).
export async function upsertTokenSnapshot(
  chain: number,
  items: ApeStoreTokenListItem[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || items.length === 0) return;

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
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("tokens")
      .upsert(chunk, { onConflict: "chain,address" });
    if (error) {
      console.error(`[tokenData] upsert chunk ${i}–${i + chunk.length} failed:`, error.message);
    }
  }
}
