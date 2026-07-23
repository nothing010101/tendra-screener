import { useState, useEffect, useRef } from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { fetchAllTrades, fetchTrades, type TendraTrade } from "@/lib/tendra";
import { tradesToCandles, fillCandles, type Candle, type TimeFrame } from "@/lib/candles";
import { formatUSDT } from "@/lib/format";
import { Activity } from "lucide-react";

const SUPPLY = 1_000_000_000;

// Convert price candles → market-cap candles (price × supply)
function toMcapCandles(candles: Candle[]): Candle[] {
  return candles.map((c) => ({
    ...c,
    open:  c.open  * SUPPLY,
    high:  c.high  * SUPPLY,
    low:   c.low   * SUPPLY,
    close: c.close * SUPPLY,
  }));
}

interface ChartTabProps {
  tokenAddress: string;
}

export function ChartTab({ tokenAddress }: ChartTabProps) {
  const [timeframe, setTimeframe] = useState<TimeFrame>("5m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTrades, setAllTrades] = useState<TendraTrade[]>([]);
  const [marketCap, setMarketCap] = useState<number>(0);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // Keep a ref so the poll closure always sees the latest trades
  const allTradesRef = useRef<TendraTrade[]>([]);

  // Initial load
  useEffect(() => {
    setAllTrades([]);
    allTradesRef.current = [];
    setMarketCap(0);
    setLoading(true);
    setError(null);

    fetchAllTrades(tokenAddress)
      .then((trades) => {
        allTradesRef.current = trades;
        setAllTrades(trades);
        if (trades.length > 0) {
          const last = trades[trades.length - 1];
          setMarketCap(last.price * SUPPLY);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tokenAddress]);

  // Silent poll — append only genuinely new trades (no loading state change)
  useEffect(() => {
    if (loading || error) return;

    const poll = async () => {
      try {
        const recent = await fetchTrades(tokenAddress, {});
        if (recent.length === 0) return;

        const current = allTradesRef.current;
        const latestTs = current.length > 0 ? current[current.length - 1].ts : 0;
        const newTrades = recent.filter((t) => t.ts > latestTs);
        if (newTrades.length === 0) return;

        const merged = [...current, ...newTrades].sort((a, b) => a.ts - b.ts);
        allTradesRef.current = merged;
        setAllTrades(merged);
        const last = newTrades[newTrades.length - 1];
        setMarketCap(last.price * SUPPLY);
      } catch {
        // silent — don't surface poll errors
      }
    };

    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [tokenAddress, loading, error]);

  // Create / recreate chart when data arrives
  useEffect(() => {
    if (!chartContainerRef.current || loading || error) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { color: "#0a0a0f" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1a1a24" },
        horzLines: { color: "#1a1a24" },
      },
      timeScale: {
        borderColor: "#1a1a24",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1a1a24",
      },
      localization: {
        // Format Y-axis labels as compact USD (MC values)
        priceFormatter: (p: number) =>
          p >= 1_000_000
            ? `$${(p / 1_000_000).toFixed(2)}M`
            : p >= 1_000
            ? `$${(p / 1_000).toFixed(1)}K`
            : `$${p.toFixed(2)}`,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        "#22c55e",
      downColor:      "#ef4444",
      borderUpColor:  "#22c55e",
      borderDownColor:"#ef4444",
      wickUpColor:    "#22c55e",
      wickDownColor:  "#ef4444",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, [loading, error]);

  // Update chart data when trades or timeframe change
  useEffect(() => {
    if (!seriesRef.current || allTrades.length === 0) return;

    const priceCandles = tradesToCandles(allTrades, timeframe);
    const filled       = fillCandles(priceCandles, timeframe);
    const mcapCandles  = toMcapCandles(filled);

    seriesRef.current.setData(mcapCandles);
    if (mcapCandles.length > 0 && chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [allTrades, timeframe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Activity className="w-5 h-5 animate-pulse" />
          <span className="font-mono text-sm">Loading chart data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (allTrades.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="font-mono text-sm">No trade data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      <div
        ref={chartContainerRef}
        className="w-full border border-border rounded-lg overflow-hidden"
      />
    </div>
  );
}
