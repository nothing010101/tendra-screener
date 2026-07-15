// Server-only client for the ape.store internal API.
// ape.store's own API has no auth, but we still centralize every call here so
// the screener has one place to cache, rate-limit, and evolve endpoints from.
//
// Shared between the Next.js app (apps/token-screener) and the standalone
// polling worker (apps/worker) so both talk to ape.store the same way.

const APESTORE_BASE = "https://ape.store";
export const ROBINHOOD_CHAIN_ID = 4663;

export interface ApeStoreTokenListItem {
  id: number;
  chain: number;
  protocol: number;
  creator: string;
  createDate: string;
  deployDate: string;
  kingDate: string | null;
  launchDate: string | null;
  address: string;
  name: string;
  symbol: string;
  description: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  logo: string | null;
  isDead: boolean;
  priceAfter: string;
  chatCount: number;
  price1H: string | null;
  price24H: string | null;
  isKing: boolean;
  marketCap: number;
  hasMap: boolean;
  dexPaid: boolean;
  isStreaming: boolean;
  streamViewers: number;
  volumeStat: {
    id: number;
    mCap: number;
    transactions: number;
    volume: number;
    volumeUSD: number;
  } | null;
  // Not part of the raw ape.store response — merged in by
  // /api/tokens and /api/token/:chain/:address from our Alchemy-derived
  // Supabase cache (ape.store's own `holders` field is always 0 on this
  // chain). `null` means we haven't computed it yet.
  holderCount?: number | null;
}

export interface ApeStoreTokenListResponse {
  items: ApeStoreTokenListItem[];
  pageCount: number;
}

export interface ApeStoreTokenDetailResponse {
  token: ApeStoreTokenListItem & {
    router: number;
    hidden: boolean;
    pairAddress: string | null;
    referrer: string | null;
    poolKey: string | null;
    tweetID: string | null;
    price: number;
    lastBump: string | null;
    holders: number;
  };
  currentPrice: number;
  marketCap: number;
  virtualLiquidity: number;
  kingProgress: number;
  apeProgress: number;
  dexPaid: boolean;
  stream: boolean;
  streamViewers: number;
}

export interface ApeStoreTrade {
  id: number;
  tokenID: number;
  to: string;
  timeStamp: string;
  transactionHash: string;
  tokenIn: string;
  nativeIn: string;
  tokenOut: string;
  nativeOut: string;
  priceBefore: string;
  priceAfter: string;
  tokenChange: number;
  nativeVolume: number;
  key: number;
  nativePrice: number;
  bump: boolean;
}

async function apeFetch<T>(path: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(`${APESTORE_BASE}${path}`, {
    headers: { "User-Agent": "robinhood-screener/1.0" },
    // `next.revalidate` is only meaningful inside a Next.js fetch cache; a
    // plain Node process (the worker) simply ignores the extra field.
    next: { revalidate: revalidateSeconds },
  } as RequestInit);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ape.store request failed (${res.status}): ${path} :: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// filter=0 is the "active/live" bucket on ape.store — the only one that
// returns populated data for a freshly-launched chain like Robinhood Chain.
export const APESTORE_LIVE_FILTER = 0;

export function fetchTokenList(params: {
  page: number;
  search?: string;
  chain?: number;
}): Promise<ApeStoreTokenListResponse> {
  const search = new URLSearchParams({
    page: String(params.page),
    sort: "0",
    order: "0",
    filter: String(APESTORE_LIVE_FILTER),
    search: params.search ?? "",
    chain: String(params.chain ?? ROBINHOOD_CHAIN_ID),
  });
  return apeFetch(`/api/tokens?${search.toString()}`, 15);
}

export function fetchTokenDetail(chain: number, address: string): Promise<ApeStoreTokenDetailResponse> {
  return apeFetch(`/api/token/${chain}/${address}`, 15);
}

export function fetchTokenTrades(chain: number, address: string): Promise<ApeStoreTrade[]> {
  return apeFetch(`/api/token/${chain}/${address}/trades`, 15);
}

// Fetches every "live" page from ape.store for a chain in one shot. Used by
// the worker (which has no browser tab paging through the list) and mirrors
// the same stop condition the Next.js screener list applies client-side, so
// both see the same full token set.
//
// IMPORTANT: ape.store's `pageCount` field on this endpoint is NOT the number
// of pages (or even related to the live-filtered result set) — it was
// observed to return a constant 48000 regardless of page number or filter,
// while the real "live" list for Robinhood Chain ends after ~122 pages. Using
// `pageCount` to compute how many pages to fetch silently truncated the
// result set (previously capped at a hardcoded 8 pages / ~192 tokens against
// an actual ~2900+ live tokens). Instead, page forward in fixed-size batches
// until a page comes back with fewer than `pageSize` items (ape.store's
// signal for "last page"), which is the only reliable end-of-list signal
// this endpoint gives.
const PAGE_FETCH_CONCURRENCY = 5;
const MAX_PAGE_SAFETY_CAP = 1000; // hard stop so a misbehaving API can't loop forever

export async function fetchAllLiveTokens(chain = ROBINHOOD_CHAIN_ID): Promise<ApeStoreTokenListItem[]> {
  const first = await fetchTokenList({ page: 1, chain });
  const pageSize = first.items.length || 24;

  let all = first.items;
  if (first.items.length < pageSize) {
    // First page was already short/empty — nothing more to fetch.
    return all;
  }

  let nextPage = 2;
  let reachedEnd = false;

  while (!reachedEnd && nextPage <= MAX_PAGE_SAFETY_CAP) {
    const batchPages = Array.from({ length: PAGE_FETCH_CONCURRENCY }, (_, i) => nextPage + i);
    const batch = await Promise.all(batchPages.map((page) => fetchTokenList({ page, chain })));

    for (const page of batch) {
      all = all.concat(page.items);
      if (page.items.length < pageSize) {
        reachedEnd = true;
        break;
      }
    }

    nextPage += PAGE_FETCH_CONCURRENCY;
  }

  return all;
}
