import { useState, useEffect } from "react";
import { fetchTrades, type TendraTrade } from "@/lib/tendra";
import { formatUSDT, formatPrice, formatTokens, formatTime } from "@/lib/format";
import { explorerAddress, explorerTx, shortAddr } from "@/lib/rpc";
import { Activity, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

interface TradesTabProps {
  tokenAddress: string;
}

export function TradesTab({ tokenAddress }: TradesTabProps) {
  const [trades, setTrades] = useState<TendraTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTrades(tokenAddress, { limit: 50 });
        setTrades(data.sort((a, b) => b.ts - a.ts));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trades");
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

  const totalTrades = trades.length;
  const buyTrades = trades.filter((t) => t.isBuy);
  const sellTrades = trades.filter((t) => !t.isBuy);
  const totalBuyVol = buyTrades.reduce((s, t) => s + t.usdt, 0);
  const totalSellVol = sellTrades.reduce((s, t) => s + t.usdt, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Activity className="w-5 h-5 animate-pulse" />
          <span className="font-mono text-sm">Loading trades...</span>
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

  if (trades.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="font-mono text-sm">No trades yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-mono">TOTAL TRADES</div>
          <div className="text-2xl font-mono font-bold mt-1">{totalTrades}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            BUY VOLUME
          </div>
          <div className="text-2xl font-mono font-bold text-green-500 mt-1">
            {formatUSDT(totalBuyVol, true)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            SELL VOLUME
          </div>
          <div className="text-2xl font-mono font-bold text-red-500 mt-1">
            {formatUSDT(totalSellVol, true)}
          </div>
        </div>
      </div>

      {/* Trades list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-xs font-mono text-muted-foreground">
                <th className="text-left px-4 py-2">TIME</th>
                <th className="text-left px-4 py-2">TYPE</th>
                <th className="text-right px-4 py-2">USDT</th>
                <th className="text-right px-4 py-2">TOKENS</th>
                <th className="text-right px-4 py-2">PRICE</th>
                <th className="text-left px-4 py-2">WALLET</th>
                <th className="text-center px-4 py-2">TX</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, i) => (
                <tr
                  key={`${trade.txHash}-${i}`}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                  data-testid={`trade-${i}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatTime(trade.ts)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold ${
                        trade.isBuy
                          ? "bg-green-500/20 text-green-500 border border-green-500/30"
                          : "bg-red-500/20 text-red-500 border border-red-500/30"
                      }`}
                    >
                      {trade.isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {trade.isBuy ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                    {formatUSDT(trade.usdt, true)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {formatTokens(trade.tokens)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {formatPrice(trade.price)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={explorerAddress(trade.trader)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-accent hover:underline"
                      data-testid={`wallet-${i}`}
                    >
                      {shortAddr(trade.trader)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={explorerTx(trade.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-accent transition-colors"
                      data-testid={`tx-${i}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
