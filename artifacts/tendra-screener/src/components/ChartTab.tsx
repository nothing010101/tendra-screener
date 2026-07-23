import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { fetchAllTrades, fetchTrades, type TendraTrade } from "@/lib/tendra";
import { tradesToCandles, fillCandles, type Candle, type TimeFrame } from "@/lib/candles";
import { formatUSDT, formatPct, formatTokens } from "@/lib/format";
import { Activity, Search, X, TrendingUp, TrendingDown } from "lucide-react";

const SUPPLY = 1_000_000_000;

function toMcapCandles(candles: Candle[]): Candle[] {
  return candles.map((c) => ({
    ...c,
    open:  c.open  * SUPPLY,
    high:  c.high  * SUPPLY,
    low:   c.low   * SUPPLY,
    close: c.close * SUPPLY,
  }));
}

function bucketTs(ts: number, intervalSec: number): number {
  return Math.floor(ts / intervalSec) * intervalSec;
}

const INTERVALS: Record<TimeFrame, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400,
};

interface WalletStats {
  address: string;
  buys: TendraTrade[];
  sells: TendraTrade[];
  investedUsdt: number;
  receivedUsdt: number;
  boughtTokens: number;
  soldTokens: number;
  netTokens: number;
  currentValue: number;   // net tokens × latest price
  totalPnl: number;
  totalPnlPct: number;
}

function calcWalletStats(
  wallet: string,
  trades: TendraTrade[],
  latestPrice: number
): WalletStats {
  const addr = wallet.toLowerCase();
  const buys  = trades.filter((t) => t.trader.toLowerCase() === addr &&  t.isBuy);
  const sells = trades.filter((t) => t.trader.toLowerCase() === addr && !t.isBuy);

  const investedUsdt  = buys.reduce((s, t) => s + t.usdt, 0);
  const receivedUsdt  = sells.reduce((s, t) => s + t.usdt, 0);
  const boughtTokens  = buys.reduce((s, t) => s + t.tokens, 0);
  const soldTokens    = sells.reduce((s, t) => s + t.tokens, 0);
  const netTokens     = Math.max(boughtTokens - soldTokens, 0);
  const currentValue  = netTokens * latestPrice;
  const totalPnl      = receivedUsdt + currentValue - investedUsdt;
  const totalPnlPct   = investedUsdt > 0 ? (totalPnl / investedUsdt) * 100 : 0;

  return {
    address: wallet,
    buys, sells,
    investedUsdt, receivedUsdt,
    boughtTokens, soldTokens, netTokens,
    currentValue, totalPnl, totalPnlPct,
  };
}

interface ChartTabProps {
  tokenAddress: string;
}

export function ChartTab({ tokenAddress }: ChartTabProps) {
  const [timeframe, setTimeframe]     = useState<TimeFrame>("5m");
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [allTrades, setAllTrades]     = useState<TendraTrade[]>([]);
  const [marketCap, setMarketCap]     = useState<number>(0);
  const [latestPrice, setLatestPrice] = useState<number>(0);

  // Wallet tracker
  const [walletInput, setWalletInput]       = useState("");
  const [trackedWallet, setTrackedWallet]   = useState("");
  const [walletStats, setWalletStats]       = useState<WalletStats | null>(null);

  const chartContainerRef  = useRef<HTMLDivElement>(null);
  const chartRef           = useRef<IChartApi | null>(null);
  const seriesRef          = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef         = useRef<ISeriesMarkersPluginApi<"Candlestick"> | null>(null);
  const allTradesRef       = useRef<TendraTrade[]>([]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setAllTrades([]);
    allTradesRef.current = [];
    setMarketCap(0);
    setLatestPrice(0);
    setLoading(true);
    setError(null);

    fetchAllTrades(tokenAddress)
      .then((trades) => {
        allTradesRef.current = trades;
        setAllTrades(trades);
        if (trades.length > 0) {
          const last = trades[trades.length - 1];
          setLatestPrice(last.price);
          setMarketCap(last.price * SUPPLY);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tokenAddress]);

  // ── Silent poll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || error) return;

    const poll = async () => {
      try {
        const recent = await fetchTrades(tokenAddress, {});
        if (recent.length === 0) return;
        const current  = allTradesRef.current;
        const latestTs = current.length > 0 ? current[current.length - 1].ts : 0;
        const newTrades = recent.filter((t) => t.ts > latestTs);
        if (newTrades.length === 0) return;
        const merged = [...current, ...newTrades].sort((a, b) => a.ts - b.ts);
        allTradesRef.current = merged;
        setAllTrades(merged);
        const last = newTrades[newTrades.length - 1];
        setLatestPrice(last.price);
        setMarketCap(last.price * SUPPLY);
      } catch { /* silent */ }
    };

    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [tokenAddress, loading, error]);

  // ── Create chart ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current || loading || error) return;

    const chart = createChart(chartContainerRef.current, {
      width:  chartContainerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: "#0a0a0f" },
        textColor:  "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1a1a24" },
        horzLines: { color: "#1a1a24" },
      },
      timeScale: {
        borderColor:     "#1a1a24",
        timeVisible:     true,
        secondsVisible:  false,
      },
      rightPriceScale: { borderColor: "#1a1a24" },
      localization: {
        priceFormatter: (p: number) =>
          p >= 1_000_000
            ? `$${(p / 1_000_000).toFixed(2)}M`
            : p >= 1_000
            ? `$${(p / 1_000).toFixed(1)}K`
            : `$${p.toFixed(2)}`,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:         "#22c55e",
      downColor:       "#ef4444",
      borderUpColor:   "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor:     "#22c55e",
      wickDownColor:   "#ef4444",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (chartContainerRef.current)
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      markersRef.current?.detach();
      markersRef.current = null;
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [loading, error]);

  // ── Update candle data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || allTrades.length === 0) return;
    const priceCandles = tradesToCandles(allTrades, timeframe);
    const filled       = fillCandles(priceCandles, timeframe);
    const mcapCandles  = toMcapCandles(filled);
    seriesRef.current.setData(mcapCandles);
    if (mcapCandles.length > 0 && chartRef.current)
      chartRef.current.timeScale().fitContent();
  }, [allTrades, timeframe]);

  // ── Update wallet markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;

    // Detach old markers
    markersRef.current?.detach();
    markersRef.current = null;

    if (!trackedWallet || allTrades.length === 0) return;

    const stats = calcWalletStats(trackedWallet, allTrades, latestPrice);
    setWalletStats(stats);

    const intervalSec = INTERVALS[timeframe];

    // Build marker list: one per trade of tracked wallet, sorted by time
    const markerList = [
      ...stats.buys.map((t) => ({
        time:     bucketTs(t.ts, intervalSec) as number,
        position: "belowBar" as const,
        color:    "#22c55e",
        shape:    "arrowUp"  as const,
        text:     `B $${t.usdt.toFixed(2)}`,
      })),
      ...stats.sells.map((t) => ({
        time:     bucketTs(t.ts, intervalSec) as number,
        position: "aboveBar" as const,
        color:    "#ef4444",
        shape:    "arrowDown" as const,
        text:     `S $${t.usdt.toFixed(2)}`,
      })),
    ].sort((a, b) => a.time - b.time);

    if (markerList.length > 0) {
      markersRef.current = createSeriesMarkers(seriesRef.current, markerList);
    }
  }, [trackedWallet, allTrades, timeframe, latestPrice]);

  // Update stats when latest price changes (unrealized P&L)
  useEffect(() => {
    if (!trackedWallet || allTrades.length === 0) return;
    setWalletStats(calcWalletStats(trackedWallet, allTrades, latestPrice));
  }, [latestPrice]);

  const confirmWallet = useCallback(() => {
    const v = walletInput.trim();
    if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) return;
    setTrackedWallet(v);
  }, [walletInput]);

  const clearWallet = useCallback(() => {
    setWalletInput("");
    setTrackedWallet("");
    setWalletStats(null);
    markersRef.current?.detach();
    markersRef.current = null;
  }, []);

  // ── Guard states ───────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Activity className="w-5 h-5 animate-pulse" />
        <span className="font-mono text-sm">Loading chart data...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">{error}</div>
  );

  if (allTrades.length === 0) return (
    <div className="text-center py-20 text-muted-foreground">
      <p className="font-mono text-sm">No trade data available</p>
    </div>
  );

  const pnlPositive = (walletStats?.totalPnl ?? 0) >= 0;

  return (
    <div className="space-y-3">

      {/* ── Top bar: MC + timeframe ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">MARKET CAP</div>
          <div className="text-2xl font-mono font-bold text-accent">
            {formatUSDT(marketCap, true)}
          </div>
        </div>
        <div className="flex gap-2">
          {(["1m", "5m", "15m", "1h", "4h"] as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              data-testid={`timeframe-${tf}`}
              className={`px-3 py-1.5 text-sm font-mono font-medium rounded transition-colors ${
                timeframe === tf
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Wallet tracker input ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmWallet()}
            placeholder="Track wallet: 0x..."
            className="w-full bg-card border border-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={confirmWallet}
          disabled={!/^0x[0-9a-fA-F]{40}$/.test(walletInput.trim())}
          className="px-3 py-1.5 text-xs font-mono font-medium bg-accent text-accent-foreground rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
        >
          Track
        </button>
        {trackedWallet && (
          <button
            onClick={clearWallet}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Clear wallet"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Chart ── */}
      <div
        ref={chartContainerRef}
        className="w-full border border-border rounded-lg overflow-hidden"
      />

      {/* ── Wallet P&L panel ── */}
      {walletStats && (walletStats.buys.length > 0 || walletStats.sells.length > 0) && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-muted/40 border-b border-border px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">TRACKING</span>
              <span className="text-xs font-mono text-accent">
                {walletStats.address.slice(0, 6)}…{walletStats.address.slice(-4)}
              </span>
            </div>
            <div className={`flex items-center gap-1 text-sm font-mono font-bold ${pnlPositive ? "text-green-500" : "text-red-500"}`}>
              {pnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {pnlPositive ? "+" : ""}{formatUSDT(walletStats.totalPnl, true)}
              <span className="text-xs opacity-70">({formatPct(walletStats.totalPnlPct)})</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
            <div className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground font-mono mb-1">INVESTED</div>
              <div className="text-sm font-mono font-bold">{formatUSDT(walletStats.investedUsdt, true)}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {walletStats.buys.length} buy{walletStats.buys.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground font-mono mb-1">RECEIVED</div>
              <div className="text-sm font-mono font-bold">{formatUSDT(walletStats.receivedUsdt, true)}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {walletStats.sells.length} sell{walletStats.sells.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground font-mono mb-1">HOLDING</div>
              <div className="text-sm font-mono font-bold">{formatTokens(walletStats.netTokens)}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                ≈ {formatUSDT(walletStats.currentValue, true)}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-muted-foreground font-mono mb-1">TOTAL P&L</div>
              <div className={`text-sm font-mono font-bold ${pnlPositive ? "text-green-500" : "text-red-500"}`}>
                {pnlPositive ? "+" : ""}{formatUSDT(walletStats.totalPnl, true)}
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${pnlPositive ? "text-green-500/70" : "text-red-500/70"}`}>
                {formatPct(walletStats.totalPnlPct)}
              </div>
            </div>
          </div>

          {/* Individual trade list */}
          <div className="border-t border-border max-h-48 overflow-y-auto">
            {[...walletStats.buys.map(t => ({ ...t, side: "buy" as const })),
               ...walletStats.sells.map(t => ({ ...t, side: "sell" as const }))]
              .sort((a, b) => b.ts - a.ts)
              .map((t, i) => (
                <div
                  key={`${t.txHash}-${i}`}
                  className="flex items-center justify-between px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      t.side === "buy"
                        ? "bg-green-500/20 text-green-500"
                        : "bg-red-500/20 text-red-500"
                    }`}>
                      {t.side === "buy" ? "BUY" : "SELL"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(t.ts * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">USDT</div>
                      <div className="text-xs font-mono font-semibold">{formatUSDT(t.usdt, true)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">MC AT TRADE</div>
                      <div className="text-xs font-mono">{formatUSDT(t.price * SUPPLY, true)}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* No trades found for wallet */}
      {trackedWallet && walletStats &&
        walletStats.buys.length === 0 && walletStats.sells.length === 0 && (
        <div className="border border-border/50 rounded-lg p-4 text-center">
          <p className="text-xs font-mono text-muted-foreground">
            No trades found for this wallet on this token
          </p>
        </div>
      )}
    </div>
  );
}
