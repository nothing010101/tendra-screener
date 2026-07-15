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
// the same MAX_PAGES the Next.js screener list applies client-side, so both
// see the same window of tokens.
export async function fetchAllLiveTokens(chain = ROBINHOOD_CHAIN_ID, maxPages = 8): Promise<ApeStoreTokenListItem[]> {
  const first = await fetchTokenList({ page: 1, chain });
  const pageSize = first.items.length || 24;
  const totalPages = Math.min(maxPages, Math.max(1, Math.ceil((first.pageCount ?? 0) / pageSize)));

  let all = first.items;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchTokenList({ page: i + 2, chain })),
    );
    for (const page of rest) {
      all = all.concat(page.items);
    }
  }
  return all;
}
