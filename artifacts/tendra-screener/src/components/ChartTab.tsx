import { useState, useEffect, useRef } from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { fetchAllTrades, fetchTrades, type TendraTrade } from "@/lib/tendra";
import { tradesToCandles, fillCandles, type TimeFrame } from "@/lib/candles";
import { formatPrice, formatUSDT } from "@/lib/format";
import { Activity } from "lucide-react";

interface ChartTabProps {
  tokenAddress: string;
}

export function ChartTab({ tokenAddress }: ChartTabProps) {
  const [timeframe, setTimeframe] = useState<TimeFrame>("5m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTrades, setAllTrades] = useState<TendraTrade[]>([]);
  const [lastPrice, setLastPrice] = useState<number>(0);
  const [marketCap, setMarketCap] = useState<number>(0);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Initial load: fetch all trades
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const trades = await fetchAllTrades(tokenAddress);
        setAllTrades(trades);
        if (trades.length > 0) {
          const last = trades[trades.length - 1];
          setLastPrice(last.price);
          setMarketCap(last.price * 1_000_000_000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trades");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  // Poll for new trades every 5s
  useEffect(() => {
    if (allTrades.length === 0) return;

    const poll = async () => {
      try {
        const recent = await fetchTrades(tokenAddress, { limit: 20 });
        if (recent.length === 0) return;

        const lastExisting = allTrades[allTrades.length - 1];
        const lastExistingTs = lastExisting.ts; // Unix seconds

        const newTrades = recent.filter((t) => t.ts > lastExistingTs);

        if (newTrades.length > 0) {
          setAllTrades((prev) => [...prev, ...newTrades]);
          const last = newTrades[newTrades.length - 1];
          setLastPrice(last.price);
          setMarketCap(last.price * 1_000_000_000);
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    };

    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [tokenAddress, allTrades]);

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || loading || error) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
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
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [loading, error]);

  // Update chart data when trades or timeframe changes
  useEffect(() => {
    if (!seriesRef.current || allTrades.length === 0) return;

    const candles = tradesToCandles(allTrades, timeframe);
    const filled = fillCandles(candles, timeframe);

    seriesRef.current.setData(filled);

    if (filled.length > 0 && chartRef.current) {
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
        <div className="flex gap-6">
          <div>
            <div className="text-xs text-muted-foreground font-mono">PRICE</div>
            <div className="text-2xl font-mono font-bold text-accent">
              {formatPrice(lastPrice)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-mono">MCAP</div>
            <div className="text-2xl font-mono font-bold">
              {formatUSDT(marketCap, true)}
            </div>
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
