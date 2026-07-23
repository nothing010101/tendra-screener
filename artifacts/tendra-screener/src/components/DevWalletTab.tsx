import { useState, useEffect } from "react";
import { getLaunch, getTokenBalance, explorerAddress, shortAddr, type LaunchInfo } from "@/lib/rpc";
import { formatUSDT, formatDate } from "@/lib/format";
import { Activity, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

interface DevWalletTabProps {
  tokenAddress: string;
}

export function DevWalletTab({ tokenAddress }: DevWalletTabProps) {
  const [launch, setLaunch] = useState<LaunchInfo | null>(null);
  const [devBalance, setDevBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const launchData = await getLaunch(tokenAddress);
        setLaunch(launchData);

        const balance = await getTokenBalance(tokenAddress, launchData.creator);
        setDevBalance(balance);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dev wallet data");
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
          <span className="font-mono text-sm">Loading dev wallet...</span>
        </div>
      </div>
    );
  }

  if (error || !launch) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
        {error || "Failed to load data"}
      </div>
    );
  }

  const devHoldingPct = (devBalance / 1_000_000_000) * 100;
  const createdDate = new Date(launch.createdAt * 1000).toISOString();
  // volume is stored as BigInt with 18 decimals (native USDT0)
  const totalVolume = Number(launch.volume) / 1e18;

  return (
    <div className="space-y-6">
      {/* Creator info */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-mono text-muted-foreground mb-4">CREATOR ADDRESS</h3>
        <a
          href={explorerAddress(launch.creator)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-accent hover:underline font-mono text-lg font-semibold"
          data-testid="creator-address"
        >
          {launch.creator}
          <ExternalLink className="w-5 h-5" />
        </a>
      </div>

      {/* Token info grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground font-mono mb-2">TOKEN CREATED</div>
          <div className="text-xl font-mono font-bold">{formatDate(createdDate)}</div>
          <div className="text-xs text-muted-foreground font-mono mt-1">
            {new Date(launch.createdAt * 1000).toLocaleTimeString()}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground font-mono mb-2">TOTAL VOLUME</div>
          <div className="text-xl font-mono font-bold">{formatUSDT(totalVolume, true)}</div>
          <div className="text-xs text-muted-foreground font-mono mt-1">All-time USDT</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground font-mono mb-2">DEV HOLDINGS</div>
          <div className="text-xl font-mono font-bold">
            {devHoldingPct.toFixed(2)}%
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-1">
            {(devBalance / 1_000_000).toFixed(2)}M tokens
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground font-mono mb-2">GRADUATION STATUS</div>
          <div className="flex items-center gap-2 mt-1">
            {launch.graduated ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-xl font-mono font-bold text-green-500">GRADUATED</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-muted-foreground" />
                <span className="text-xl font-mono font-bold text-muted-foreground">BONDING</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Graduation details */}
      {launch.graduated && launch.pair !== "0x0000000000000000000000000000000000000000" && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-6">
          <h3 className="text-sm font-mono text-accent mb-3">GRADUATED TO AMM</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">PAIR ADDRESS</span>
              <a
                href={explorerAddress(launch.pair)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-mono text-sm flex items-center gap-1"
                data-testid="pair-address"
              >
                {shortAddr(launch.pair)}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
