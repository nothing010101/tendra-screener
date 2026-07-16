import { NextRequest, NextResponse } from "next/server";
import { fetchLiveTokenPages, ROBINHOOD_CHAIN_ID } from "@/lib/apestore";

export const dynamic = "force-dynamic";

// ─── Holder counts (Supabase) ────────────────────────────────────────────────
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
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } },
  );
  if (!res.ok) return new Map();
  const rows: HolderRow[] = (await res.json()) ?? [];
  const map = new Map<string, HolderRow>();
  for (const r of rows) map.set(r.token_address.toLowerCase(), r);
  return map;
}

// ─── Route ────────────────────────────────────────────────────────────────────
// Data flows: ape.store → this route → client. No Supabase for token data.
// Vercel's fetch cache (next.revalidate=15 inside apeFetch) means ape.store is
// hit at most once per 15 s regardless of how many users are on the screener.
//
// mode=new → 3 pages × 24 tokens from ape.store sort=1 (newest), top 50 by deployDate
// mode=mc  → 20 pages from ape.store sort=2 (market cap desc), filter MC ≥ $5 K
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "mc" ? "mc" : "new";

  try {
    const [tokens, holderMap] = await Promise.all([
      mode === "new"
        ? fetchLiveTokenPages(ROBINHOOD_CHAIN_ID, 3, "1")   // sort=1 = newest on ape.store
        : fetchLiveTokenPages(ROBINHOOD_CHAIN_ID, 20, "2"),  // sort=2 = market cap desc
      getHolderCountsByChain(ROBINHOOD_CHAIN_ID),
    ]);

    // Merge holder counts and sort.
    const items = tokens
      .filter((t) => !t.isDead)
      .map((t) => {
        const h = holderMap.get(t.address.toLowerCase());
        return {
          ...t,
          holderCount:     h?.holder_count ?? null,
          holderUpdatedAt: h?.computed_at  ?? null,
        };
      });

    let result = items;
    if (mode === "new") {
      // Newest 50 by deploy date
      result = [...items]
        .sort((a, b) => new Date(b.deployDate).getTime() - new Date(a.deployDate).getTime())
        .slice(0, 50);
    } else {
      // MC ≥ $5K, already sorted by ape.store MC desc (sort=2)
      result = items.filter((t) => t.marketCap >= 5_000);
    }

    return NextResponse.json({ items: result, total: result.length, mode });
  } catch (err) {
    console.error("[/api/tokens]", err);
    return NextResponse.json(
      { error: "Failed to load tokens", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
