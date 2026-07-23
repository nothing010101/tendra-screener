import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { fetchBoard, type BoardToken } from "@/lib/tendra";
import { fetchOnchainBatch, TENDRA_CONTRACT, explorerAddress } from "@/lib/rpc";
import { formatUSDT, formatPct, timeAgo, gradPct } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Activity, Clock, ShieldCheck } from "lucide-react";

type SortMode = "volume" | "marketcap" | "new";

export default function TokenList() {
  const [tokens, setTokens] = useState<BoardToken[]>([]);
  const [sort, setSort] = useState<SortMode>("volume");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which addresses we've already enriched to avoid redundant RPC calls
  const enrichedRef = useRef<Map<string, { name: string; symbol: string; marketCap: number; price: number }>>(new Map());

  const loadTokens = async (sortBy: SortMode) => {
    try {
      setLoading(true);
      const data = await fetchBoard(sortBy);

      // Immediately show board data (with placeholders for name/symbol)
      setTokens(data);
      setError(null);
      setLoading(false);

      // Enrich with on-chain data for tokens we haven't fetched yet
      const unknown = data.filter((t) => !enrichedRef.current.has(t.address.toLowerCase()));
      if (unknown.length > 0) {
        const onchain = await fetchOnchainBatch(unknown.map((t) => t.address));
        onchain.forEach((info, addr) => {
          enrichedRef.current.set(addr, {
            name: info.name,
            symbol: info.symbol,
            marketCap: info.marketCap,
            price: info.price,
          });
        });
        // Re-merge enriched data into the token list
        setTokens((prev) =>
          prev.map((t) => {
            const e = enrichedRef.current.get(t.address.toLowerCase());
            if (!e) return t;
            return { ...t, name: e.name, symbol: e.symbol, marketCap: e.marketCap, price: e.price };
          })
        );
      } else {
        // All already enriched — just re-apply cached enrichment
        setTokens((prev) =>
          prev.map((t) => {
            const e = enrichedRef.current.get(t.address.toLowerCase());
            if (!e) return t;
            return { ...t, name: e.name, symbol: e.symbol, marketCap: e.marketCap, price: e.price };
          })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens(sort);
    const interval = setInterval(() => loadTokens(sort), 10_000);
    return () => clearInterval(interval);
  }, [sort]);

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
            <button
              onClick={() => setSort("volume")}
              data-testid="sort-volume"
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                sort === "volume"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              Volume
            </button>
            <button
              onClick={() => setSort("marketcap")}
              data-testid="sort-marketcap"
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                sort === "marketcap"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              Market Cap
            </button>
            <button
              onClick={() => setSort("new")}
              data-testid="sort-new"
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                sort === "new"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              New
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
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
              <div></div>
              <div>TOKEN</div>
              <div className="text-right">MCAP / GRAD</div>
              <div className="text-right">VOL 24H</div>
              <div className="text-right">TRADES</div>
              <div className="text-right">CHANGE</div>
              <div className="text-right">LAST TRADE</div>
              <div></div>
            </div>

            {/* Token rows */}
            {tokens.map((token) => {
              const progress = gradPct(token.marketCap);
              return (
                <Link
                  key={token.address}
                  href={`/token/${token.address}`}
                  data-testid={`token-row-${token.address}`}
                  className="grid grid-cols-[auto_1fr_120px_100px_80px_100px_100px_60px] gap-4 px-4 py-3 items-center bg-card hover:bg-card/60 border border-border rounded transition-colors cursor-pointer group"
                >
                  <Avatar
                    src={token.imageUrl}
                    alt={token.name}
                    fallback={token.name}
                    size="md"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate group-hover:text-accent transition-colors">
                        {token.name}
                      </span>
                      <span
                        title={`Launched via official Tendra factory ${TENDRA_CONTRACT}`}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0"
                      >
                        <ShieldCheck className="w-2.5 h-2.5" />
                        OFFICIAL
                      </span>
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

                  <div
                    className={`text-right font-mono text-sm font-semibold ${
                      (token.change24h ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
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
