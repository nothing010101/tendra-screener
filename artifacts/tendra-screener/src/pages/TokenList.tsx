import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { fetchBoard, type BoardToken } from "@/lib/tendra";
import { fetchOnchainBatch, getTokenCount, getTokenAt, type LaunchInfo } from "@/lib/rpc";
import { formatUSDT, formatPct, timeAgo, gradPct } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Activity, Clock, Sparkles } from "lucide-react";

/** Convert on-chain LaunchInfo → BoardToken (for tokens not yet in board API) */
function launchToToken(info: LaunchInfo): BoardToken {
  return {
    address: info.token,
    name: info.name,
    symbol: info.symbol,
    metadataURI: "",
    imageUrl: null,
    description: null,
    website: null,
    twitter: null,
    vol24h: 0,
    trades: 0,
    traders: 0,
    holders: 0,
    change24h: null,
    lastTradeAt: null,
    gradMcap: null,
    graduated: info.graduated,
    marketCap: info.marketCap,
    price: info.price,
  };
}

type SortMode = "volume" | "marketcap" | "new";

// NEW badge TTL — show badge for 3 minutes after a token first appears
const NEW_BADGE_TTL_MS = 3 * 60 * 1000;

function applySort(tokens: BoardToken[], sortBy: SortMode, apiOrder: string[]): BoardToken[] {
  if (sortBy === "new") {
    // Trust the API's ordering for "new" — it knows creation time
    const orderMap = new Map(apiOrder.map((a, i) => [a.toLowerCase(), i]));
    return [...tokens].sort(
      (a, b) => (orderMap.get(a.address.toLowerCase()) ?? 999) - (orderMap.get(b.address.toLowerCase()) ?? 999)
    );
  }
  if (sortBy === "volume")    return [...tokens].sort((a, b) => b.vol24h - a.vol24h);
  if (sortBy === "marketcap") return [...tokens].sort((a, b) => b.marketCap - a.marketCap);
  return tokens;
}

export default function TokenList() {
  const [tokens, setTokens]           = useState<BoardToken[]>([]);
  const [sort, setSort]               = useState<SortMode>("volume");
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  // address → timestamp when it first appeared (for NEW badge)
  const newAddressesRef               = useRef<Map<string, number>>(new Map());
  // all addresses we've seen so far across polls
  const knownAddressesRef             = useRef<Set<string>>(new Set());
  // enriched cache: address → {name, symbol, marketCap, price}
  const enrichedRef                   = useRef<Map<string, { name: string; symbol: string; marketCap: number; price: number }>>(new Map());
  // last time we re-enriched ALL tokens (for price freshness)
  const lastEnrichAllRef              = useRef<number>(0);
  // keep sort in a ref so async callbacks never capture a stale value
  const sortRef                       = useRef<SortMode>("volume");
  // api ordering of addresses (used for "new" sort)
  const apiOrderRef                   = useRef<string[]>([]);
  // whether first load has completed
  const initializedRef                = useRef(false);
  // pending new token count (for banner)
  const [newCount, setNewCount]       = useState(0);
  // last known on-chain token count (to detect brand-new launches)
  const tokenCountRef                 = useRef<number>(-1);

  const mergeEnriched = useCallback((raw: BoardToken[]): BoardToken[] => {
    return raw.map((t) => {
      const e = enrichedRef.current.get(t.address.toLowerCase());
      return e ? { ...t, name: e.name || t.name, symbol: e.symbol || t.symbol, marketCap: e.marketCap, price: e.price } : t;
    });
  }, []);

  const doLoad = useCallback(async (sortBy: SortMode, silent: boolean) => {
    sortRef.current = sortBy;
    try {
      if (!silent) setLoading(true);

      const data = await fetchBoard(sortBy);
      apiOrderRef.current = data.map((t) => t.address);

      // Detect genuinely new tokens (not seen before)
      const now = Date.now();
      let freshCount = 0;
      for (const t of data) {
        const addr = t.address.toLowerCase();
        if (!knownAddressesRef.current.has(addr)) {
          knownAddressesRef.current.add(addr);
          if (initializedRef.current) {
            // First poll after init — mark as new
            newAddressesRef.current.set(addr, now);
            freshCount++;
          }
        }
      }
      if (freshCount > 0) setNewCount((c) => c + freshCount);

      // Show board data immediately (with cached enrichment applied)
      const merged = mergeEnriched(data);
      setTokens(applySort(merged, sortBy, apiOrderRef.current));
      setError(null);
      if (!silent) setLoading(false);

      // Enrich new tokens (never enriched before)
      const unenriched = data.filter((t) => !enrichedRef.current.has(t.address.toLowerCase()));
      // Re-enrich all every 30s for fresh prices
      const shouldReenrichAll = now - lastEnrichAllRef.current > 30_000;

      const toEnrich = shouldReenrichAll
        ? data
        : unenriched;

      if (toEnrich.length > 0) {
        if (shouldReenrichAll) lastEnrichAllRef.current = now;
        const onchain = await fetchOnchainBatch(toEnrich.map((t) => t.address));
        onchain.forEach((info, addr) => {
          enrichedRef.current.set(addr, {
            name: info.name,
            symbol: info.symbol,
            marketCap: info.marketCap,
            price: info.price,
          });
        });
      }

      // Re-apply enrichment and re-sort
      setTokens((prev) =>
        applySort(mergeEnriched(prev), sortRef.current, apiOrderRef.current)
      );

      if (!initializedRef.current) {
        initializedRef.current = true;
        // Mark all addresses as known (not "new") after first load
        for (const t of data) knownAddressesRef.current.add(t.address.toLowerCase());
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
      if (!silent) setLoading(false);
    }
  }, [mergeEnriched]);

  useEffect(() => {
    sortRef.current = sort;
    initializedRef.current = false;
    setNewCount(0);
    doLoad(sort, false);
    // Poll every 5s — silent after first load
    const id = setInterval(() => doLoad(sort, true), 5_000);
    return () => clearInterval(id);
  }, [sort, doLoad]);

  // ── Contract-level polling: catch tokens not yet in board API ─────────────
  // Board API only lists tokens that have traded. We also poll tokenCount()
  // directly so newly launched tokens (0 trades) appear immediately.
  // On first run we also do a catch-up for any existing no-trade tokens.
  useEffect(() => {
    const addMissingTokens = async (infos: (LaunchInfo | null)[], markAsNew: boolean) => {
      const now = Date.now();
      const toAdd: BoardToken[] = [];

      for (const info of infos) {
        if (!info) continue;
        const addr = info.token.toLowerCase();
        if (knownAddressesRef.current.has(addr)) continue;

        knownAddressesRef.current.add(addr);
        if (markAsNew) newAddressesRef.current.set(addr, now);

        enrichedRef.current.set(addr, {
          name: info.name, symbol: info.symbol,
          marketCap: info.marketCap, price: info.price,
        });
        toAdd.push(launchToToken(info));
      }

      if (toAdd.length === 0) return;

      setTokens((prev) => {
        const merged = [
          ...toAdd.filter((t) => !prev.some((p) => p.address.toLowerCase() === t.address.toLowerCase())),
          ...prev,
        ];
        return applySort(merged, sortRef.current, apiOrderRef.current);
      });
      if (markAsNew) setNewCount((c) => c + toAdd.length);
    };

    const pollContract = async () => {
      try {
        const count = await getTokenCount();

        if (tokenCountRef.current === -1) {
          // ── First run: catch-up pass ──────────────────────────────────────
          // Check last 20 contract tokens for any missing from board API.
          // Waits briefly to let initial board load populate knownAddressesRef.
          tokenCountRef.current = count;
          await new Promise((r) => setTimeout(r, 2_000));

          const catchUpIndices: number[] = [];
          for (let i = Math.max(0, count - 20); i < count; i++) catchUpIndices.push(i);

          const infos = await Promise.all(catchUpIndices.map((i) => getTokenAt(i).catch(() => null)));
          // Don't mark catch-up tokens as "new" — they existed before
          await addMissingTokens(infos, false);
          return;
        }

        if (count <= tokenCountRef.current) return;

        // ── Ongoing: truly new launches ───────────────────────────────────
        const newIndices: number[] = [];
        for (let i = tokenCountRef.current; i < count; i++) newIndices.push(i);
        tokenCountRef.current = count;

        const infos = await Promise.all(newIndices.map((i) => getTokenAt(i).catch(() => null)));
        await addMissingTokens(infos, true);

      } catch { /* silent */ }
    };

    pollContract();
    const id = setInterval(pollContract, 5_000);
    return () => clearInterval(id);
  }, []);

  // Expire NEW badges after TTL
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [addr, ts] of newAddressesRef.current) {
        if (now - ts > NEW_BADGE_TTL_MS) {
          newAddressesRef.current.delete(addr);
          changed = true;
        }
      }
      if (changed) setNewCount(newAddressesRef.current.size);
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const isNew = (address: string): boolean =>
    newAddressesRef.current.has(address.toLowerCase());

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TendraScreener</h1>
              <p className="text-xs text-muted-foreground font-mono">Real-time token tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(["volume", "marketcap", "new"] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                data-testid={`sort-${s}`}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  sort === s
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "volume" ? "Volume" : s === "marketcap" ? "Market Cap" : "New"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* New token banner */}
      {newCount > 0 && (
        <div className="sticky top-[57px] z-40 flex items-center justify-center py-1.5 bg-accent/10 border-b border-accent/20">
          <button
            onClick={() => { setSort("new"); setNewCount(0); }}
            className="flex items-center gap-2 text-xs font-mono text-accent font-medium hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            {newCount} new token{newCount > 1 ? "s" : ""} detected — click to view
          </button>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        {/* Initial loading */}
        {loading && tokens.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Activity className="w-5 h-5 animate-pulse" />
              <span className="font-mono text-sm">Loading tokens...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && tokens.length === 0 && !error && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="font-mono text-sm">No tokens found</p>
          </div>
        )}

        {tokens.length > 0 && (
          <div className="space-y-1">
            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_120px_100px_80px_100px_100px_60px] gap-4 px-4 py-2 text-xs font-mono text-muted-foreground border-b border-border">
              <div />
              <div>TOKEN</div>
              <div className="text-right">MCAP / GRAD</div>
              <div className="text-right">VOL 24H</div>
              <div className="text-right">TRADES</div>
              <div className="text-right">CHANGE</div>
              <div className="text-right">LAST TRADE</div>
              <div />
            </div>

            {tokens.map((token) => {
              const progress  = gradPct(token.marketCap);
              const tokenIsNew = isNew(token.address);
              return (
                <Link
                  key={token.address}
                  href={`/token/${token.address}`}
                  data-testid={`token-row-${token.address}`}
                  className={`grid grid-cols-[auto_1fr_120px_100px_80px_100px_100px_60px] gap-4 px-4 py-3 items-center border rounded transition-colors cursor-pointer group ${
                    tokenIsNew
                      ? "bg-accent/5 border-accent/30 hover:bg-accent/10"
                      : "bg-card hover:bg-card/60 border-border"
                  }`}
                >
                  <Avatar src={token.imageUrl} alt={token.name} fallback={token.name} size="md" />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate group-hover:text-accent transition-colors">
                        {token.name || token.address.slice(0, 8) + "…"}
                      </span>
                      {tokenIsNew && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-accent/20 text-accent border border-accent/30 shrink-0 animate-pulse">
                          <Sparkles className="w-2 h-2" />
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {token.symbol}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-mono font-semibold">
                      {formatUSDT(token.marketCap, true)}
                    </div>
                    <Progress value={progress} className="mt-1 h-0.5" />
                  </div>

                  <div className="text-right font-mono text-sm font-semibold text-foreground">
                    {formatUSDT(token.vol24h, true)}
                  </div>

                  <div className="text-right font-mono text-sm text-muted-foreground">
                    {token.trades}
                  </div>

                  <div className={`text-right font-mono text-sm font-semibold ${
                    (token.change24h ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                  }`}>
                    {formatPct(token.change24h)}
                  </div>

                  <div className="text-right font-mono text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(token.lastTradeAt)}
                  </div>

                  <div>
                    {token.graduated && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30">
                        GRAD
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
