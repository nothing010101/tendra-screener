import { useState, useEffect } from "react";
import { fetchTrades } from "@/lib/tendra";
import { analyzeBundles, type BundleResult } from "@/lib/bundle";
import { formatUSDT } from "@/lib/format";
import { explorerAddress, shortAddr } from "@/lib/rpc";
import { Activity, AlertTriangle, ExternalLink, CheckCircle2 } from "lucide-react";

interface BundleTabProps {
  tokenAddress: string;
}

export function BundleTab({ tokenAddress }: BundleTabProps) {
  const [result, setResult] = useState<BundleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const trades = await fetchTrades(tokenAddress, { limit: 100 });
        const analysis = analyzeBundles(trades);
        setResult(analysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze bundles");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenAddress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Activity className="w-5 h-5 animate-pulse" />
          <span className="font-mono text-sm">Analyzing early buyers...</span>
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

  if (!result || result.bundles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <div className="text-center">
          <p className="font-mono text-lg font-semibold text-foreground">
            No coordinated buying detected
          </p>
          <p className="font-mono text-sm text-muted-foreground mt-2">
            Early trades appear organic
          </p>
        </div>
        {result && (
          <div className="mt-4 text-center text-xs font-mono text-muted-foreground">
            <div>Early buyers: {result.earlyBuyers.length}</div>
            <div>Total early USDT: {formatUSDT(result.totalEarlyUsdt, true)}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning header */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-mono font-bold text-destructive">Coordinated Buying Detected</h3>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {result.bundles.length} group{result.bundles.length > 1 ? "s" : ""} of wallets bought within seconds of each other
          </p>
        </div>
      </div>

      {/* Bundle cards */}
      <div className="space-y-4">
        {result.bundles.map((bundle, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-lg p-6 space-y-4"
            data-testid={`bundle-${i}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-mono font-bold text-lg">Bundle #{i + 1}</h4>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {bundle.wallets.length} wallets • within {bundle.windowSec.toFixed(0)}s
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground font-mono">TOTAL SPENT</div>
                <div className="text-xl font-mono font-bold text-destructive">
                  {formatUSDT(bundle.totalUsdt, true)}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  {bundle.holdPct.toFixed(2)}% of supply
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="text-xs text-muted-foreground font-mono mb-2">WALLETS</div>
              <div className="space-y-2">
                {bundle.wallets.map((wallet, j) => (
                  <a
                    key={j}
                    href={explorerAddress(wallet)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-mono text-sm text-accent hover:underline"
                    data-testid={`bundle-${i}-wallet-${j}`}
                  >
                    {shortAddr(wallet)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-muted-foreground font-mono">FIRST BUY</div>
                <div className="text-sm font-mono mt-1">
                  {new Date(bundle.firstBuyAt).toLocaleTimeString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground font-mono">LAST BUY</div>
                <div className="text-sm font-mono mt-1">
                  {new Date(bundle.lastBuyAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between">
        <div className="font-mono text-sm text-muted-foreground">
          Total early buyers analyzed: {result.earlyBuyers.length}
          {result.suppressedCount > 0 && ` (${result.suppressedCount} bridge/relay wallets excluded)`}
        </div>
        <div className="font-mono text-sm font-semibold">
          Early USDT: {formatUSDT(result.totalEarlyUsdt, true)}
        </div>
      </div>
    </div>
  );
}
