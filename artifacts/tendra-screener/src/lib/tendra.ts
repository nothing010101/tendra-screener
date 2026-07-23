// Tendra.fun public API client
// In dev: requests go to <BASE_URL>/tendra-proxy (Vite proxy → tendra.fun, avoids CORS)
// In prod (Vercel): /tendra-proxy is rewritten to tendra.fun by vercel.json

const BASE_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, '');
const BASE = `${BASE_PREFIX}/tendra-proxy/api`;

const TENDRA_IMG_BASE = "https://tendra.fun";

export interface BoardToken {
  address: string;
  // name & symbol come from RPC (not in board API) — filled later
  name: string;
  symbol: string;
  metadataURI: string;
  imageUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  vol24h: number;      // USDT, already divided by 1e18
  trades: number;
  traders: number;
  holders: number;
  change24h: number | null;
  lastTradeAt: number | null; // Unix seconds
  gradMcap: number | null;    // USDT
  graduated: boolean;
  marketCap: number;  // derived
  price: number;      // derived
}

export interface TendraTrade {
  ts: number;       // Unix seconds
  isBuy: boolean;
  trader: string;
  usdt: number;     // USDT float (divided by 1e18)
  tokens: number;   // token amount float (divided by 1e18)
  price: number;    // USDT per token (already a float from API)
  txHash: string;
}

interface RawBoardStats {
  vol24h: string;           // BigInt string, 1e18
  trades: number;
  traders: number;
  holders: number;
  change24h: number | null;
  lastTradeAt: number | null;
  gradMcap: string | null;  // BigInt string, 1e18, or null
}

interface RawMeta {
  metadataURI: string; // JSON string with i,d,n,s,w,x,t,g fields
}

interface ParsedMeta {
  image?: string;
  description?: string;
  name?: string;
  symbol?: string;
  website?: string;
  twitter?: string;
}

function parseMeta(uri: string): ParsedMeta {
  try {
    const obj = JSON.parse(uri) as Record<string, string>;
    return {
      image: obj.i,
      description: obj.d,
      name: obj.n,
      symbol: obj.s,
      website: obj.w,
      twitter: obj.x ?? obj.t,
    };
  } catch {
    return {};
  }
}

function parseWei(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    return Number(BigInt(raw)) / 1e18;
  } catch {
    return 0;
  }
}

export async function fetchBoard(sort: "new" | "marketcap" | "volume" = "volume"): Promise<BoardToken[]> {
  const res = await fetch(`${BASE}/board?sort=${sort}`);
  if (!res.ok) throw new Error(`Board fetch failed: ${res.status}`);
  const data = await res.json() as {
    stats: Record<string, RawBoardStats>;
    meta: Record<string, RawMeta>;
  };

  const tokens: BoardToken[] = [];

  for (const [address, stats] of Object.entries(data.stats)) {
    const rawMeta = data.meta[address];
    const meta = rawMeta ? parseMeta(rawMeta.metadataURI) : {};

    const vol24h = parseWei(stats.vol24h);
    const gradMcap = stats.gradMcap ? parseWei(stats.gradMcap) : null;

    // Price & mcap: derived from gradMcap when graduated, otherwise 0
    // For live tokens, we'll enrich from RPC later
    const marketCap = gradMcap ?? 0;
    const price = marketCap / 1_000_000_000;

    tokens.push({
      address,
      name: meta.name ?? "",
      symbol: meta.symbol ?? "",
      metadataURI: rawMeta?.metadataURI ?? "",
      imageUrl: meta.image ? `${TENDRA_IMG_BASE}${meta.image}` : null,
      description: meta.description ?? null,
      website: meta.website ?? null,
      twitter: meta.twitter ?? null,
      vol24h,
      trades: stats.trades,
      traders: stats.traders,
      holders: stats.holders,
      change24h: stats.change24h ?? null,
      lastTradeAt: stats.lastTradeAt ?? null,
      gradMcap,
      graduated: gradMcap !== null,
      marketCap,
      price,
    });
  }

  return tokens;
}

export interface TradeOptions {
  limit?: number;
  page?: number;
  type?: "buy" | "sell";
  from?: number;
  to?: number;
}

interface RawTrade {
  ts: number;
  isBuy: boolean;
  trader: string;
  usdt: string;    // BigInt string, 1e18
  tokens: string;  // BigInt string, 1e18
  price: number;
  txHash: string;
}

function parseRawTrade(raw: RawTrade): TendraTrade {
  return {
    ts: raw.ts,
    isBuy: raw.isBuy,
    trader: raw.trader,
    usdt: parseWei(raw.usdt),
    tokens: parseWei(raw.tokens),
    price: raw.price,
    txHash: raw.txHash,
  };
}

export async function fetchTrades(ca: string, options: TradeOptions = {}): Promise<TendraTrade[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.page) params.set("page", String(options.page));
  if (options.type) params.set("type", options.type);
  if (options.from) params.set("from", String(options.from));
  if (options.to) params.set("to", String(options.to));

  const url = `${BASE}/trades/${ca}${params.size ? "?" + params : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trades fetch failed: ${res.status}`);
  const raw = await res.json() as { trades: RawTrade[] };
  return (raw.trades ?? []).map(parseRawTrade);
}

/** Fetch all trades for a token in one shot (Tendra API ignores page param).
 *  Returns sorted oldest-first for charting. */
export async function fetchAllTrades(ca: string): Promise<TendraTrade[]> {
  // The API returns all trades in a single response regardless of limit/page params.
  // Do NOT paginate — it loops indefinitely returning the same data.
  const trades = await fetchTrades(ca, {});
  return trades.sort((a, b) => a.ts - b.ts);
}
