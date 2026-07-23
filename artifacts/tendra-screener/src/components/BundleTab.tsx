import { useState, useEffect } from "react";
import { fetchAllTrades } from "@/lib/tendra";
import { analyzeBundles, type BundleResult, type Bundle } from "@/lib/bundle";
import { fetchIntraGroupTransfers, type TransferEvidence } from "@/lib/rpc";
import { formatUSDT, formatTokens } from "@/lib/format";
import { explorerAddress, explorerTx, shortAddr } from "@/lib/rpc";
import {
  Activity, AlertTriangle, ExternalLink,
  CheckCircle2, ArrowRight, Loader2, Link2,
} from "lucide-react";

interface BundleTabProps {
  tokenAddress: string;
}

// Per-bundle evidence (loaded async after bundle analysis)
interface BundleEvidence {
  transfers: TransferEvidence[];
  loading: boolean;
}

export function BundleTab({ tokenAddress }: BundleTabProps) {
  const [result, setResult]     = useState<BundleResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Map of bundle index → evidence
  const [evidence, setEvidence] = useState<Map<number, BundleEvidence>>(new Map());

  // ── Fetch trades → analyze bundles ────────────────────────────────────────
  useEffect(() => {
    setResult(null);
    setEvidence(new Map());
    setLoading(true);
    setError(null);

    fetchAllTrades(tokenAddress)
      .then((trades) => {
        const analysis = analyzeBundles(trades);
        setResult(analysis);

        // Immediately kick off evidence fetch for each bundle
        if (analysis.bundles.length > 0) {
          const initial = new Map<number, BundleEvidence>();
          analysis.bundles.forEach((_, i) => initial.set(i, { transfers: [], loading: true }));
          setEvidence(initial);

          analysis.bundles.forEach((bundle, i) => {
            fetchIntraGroupTransfers(
              tokenAddress,
              bundle.wallets,
              bundle.firstBuyAt - 300,  // look 5 min before first buy
              bundle.lastBuyAt  + 300,
            )
              .then((transfers) => {
                setEvidence((prev) => {
                  const next = new Map(prev);
                  next.set(i, { transfers, loading: false });
                  return next;
                });
              })
              .catch(() => {
                setEvidence((prev) => {
                  const next = new Map(prev);
                  next.set(i, { transfers: [], loading: false });
                  return next;
                });
              });
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to analyze"))
      .finally(() => setLoading(false));
  }, [tokenAddress]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Activity className="w-5 h-5 animate-pulse" />
        <span className="font-mono text-sm">Analyzing early buyers...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">{error}</div>
  );

  if (!result || result.bundles.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <CheckCircle2 className="w-12 h-12 text-green-500" />
      <div className="text-center">
        <p className="font-mono text-lg font-semibold">No coordinated buying detected</p>
        <p className="font-mono text-sm text-muted-foreground mt-2">Early trades appear organic</p>
      </div>
      {result && (
        <div className="mt-2 text-center text-xs font-mono text-muted-foreground space-y-1">
          <div>Early buyers analyzed: {result.earlyBuyers.length}</div>
          <div>Total early USDT: {formatUSDT(result.totalEarlyUsdt, true)}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Warning banner ── */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h3 className="font-mono font-bold text-destructive">Coordinated Buying Detected</h3>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {result.bundles.length} group{result.bundles.length > 1 ? "s" : ""} of wallets
            bought within seconds of each other.
            On-chain transfers between these wallets confirm coordination.
          </p>
        </div>
      </div>

      {/* ── Bundle cards ── */}
      <div className="space-y-6">
        {result.bundles.map((bundle, i) => (
          <BundleCard
            key={i}
            index={i}
            bundle={bundle}
            evidence={evidence.get(i) ?? { transfers: [], loading: true }}
          />
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>
          Early buyers analyzed: {result.earlyBuyers.length}
          {result.suppressedCount > 0 && ` · ${result.suppressedCount} protocol wallets excluded`}
        </span>
        <span>Early USDT: {formatUSDT(result.totalEarlyUsdt, true)}</span>
      </div>
    </div>
  );
}

// ── Bundle card ──────────────────────────────────────────────────────────────

function BundleCard({
  index,
  bundle,
  evidence,
}: {
  index: number;
  bundle: Bundle;
  evidence: BundleEvidence;
}) {
  return (
    <div className="bg-card border border-destructive/30 rounded-lg overflow-hidden" data-testid={`bundle-${index}`}>

      {/* Header row */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">Bundle #{index + 1}</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30">
              {bundle.wallets.length} wallets
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Bought within {bundle.windowSec < 1 ? "<1" : bundle.windowSec.toFixed(0)}s of each other
            &nbsp;·&nbsp;
            {new Date(bundle.firstBuyAt * 1000).toLocaleTimeString()} –{" "}
            {new Date(bundle.lastBuyAt  * 1000).toLocaleTimeString()}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground font-mono">TOTAL SPENT</div>
          <div className="text-xl font-mono font-bold text-destructive">
            {formatUSDT(bundle.totalUsdt, true)}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {bundle.holdPct.toFixed(2)}% of supply
          </div>
        </div>
      </div>

      {/* Wallets list */}
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-3">
          Wallets involved
        </div>
        <div className="space-y-1.5">
          {bundle.wallets.map((wallet, j) => (
            <a
              key={j}
              href={explorerAddress(wallet)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-mono text-sm text-accent hover:underline group"
              data-testid={`bundle-${index}-wallet-${j}`}
            >
              <span className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center text-[9px] font-bold text-destructive shrink-0">
                {j + 1}
              </span>
              {wallet}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      </div>

      {/* On-chain transfer evidence */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-3.5 h-3.5 text-amber-400" />
          <div className="text-[10px] text-amber-400 font-mono uppercase tracking-wider">
            On-chain connection evidence
          </div>
        </div>

        {evidence.loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs font-mono">Querying blockchain transfers...</span>
          </div>
        ) : evidence.transfers.length === 0 ? (
          <div className="bg-muted/30 border border-border rounded-lg p-3">
            <p className="text-xs font-mono text-muted-foreground">
              No direct token transfers found between these wallets on-chain.
              Coordination may be via a shared funder or the same private key.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {evidence.transfers.map((tx, k) => (
              <TransferRow key={k} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Individual transfer row ──────────────────────────────────────────────────

function TransferRow({ tx }: { tx: TransferEvidence }) {
  return (
    <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5">
      {/* From */}
      <a
        href={explorerAddress(tx.from)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-accent hover:underline shrink-0"
      >
        {shortAddr(tx.from)}
      </a>

      {/* Arrow + amount */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-mono text-amber-300 truncate">
          {formatTokens(tx.amount)} tokens
        </span>
      </div>

      {/* To */}
      <a
        href={explorerAddress(tx.to)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-accent hover:underline shrink-0"
      >
        {shortAddr(tx.to)}
      </a>

      {/* TX link */}
      <a
        href={explorerTx(tx.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-amber-400 transition-colors shrink-0"
        title="View transaction"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
