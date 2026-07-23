import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Avatar } from "@/components/Avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartTab } from "@/components/ChartTab";
import { TradesTab } from "@/components/TradesTab";
import { DevWalletTab } from "@/components/DevWalletTab";
import { BundleTab } from "@/components/BundleTab";
import { fetchBoard, type BoardToken } from "@/lib/tendra";
import { formatUSDT, formatPrice } from "@/lib/format";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { explorerAddress } from "@/lib/rpc";

export default function TokenDetail() {
  const { address } = useParams<{ address: string }>();
  const [token, setToken] = useState<BoardToken | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const load = async () => {
      try {
        setLoading(true);
        const tokens = await fetchBoard("volume");
        const found = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
        setToken(found || null);
      } catch (err) {
        console.error("Failed to load token:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [address]);

  if (!address) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-mono text-sm">Invalid token address</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-mono text-sm">Loading token...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-mono text-sm">Token not found</p>
        <Link href="/" className="text-accent hover:underline font-mono text-sm">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              data-testid="back-to-list"
              className="p-2 hover:bg-secondary rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <Avatar src={token.imageUrl} alt={token.name} fallback={token.name} size="lg" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold truncate">{token.name}</h1>
                {token.graduated && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-accent/20 text-accent border border-accent/30">
                    GRADUATED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-mono">{token.symbol}</span>
                <span className="text-xs">•</span>
                <a
                  href={explorerAddress(token.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs hover:text-accent transition-colors flex items-center gap-1"
                  data-testid="explorer-link"
                >
                  {token.address.slice(0, 8)}...{token.address.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="text-right">
                <div className="text-xs text-muted-foreground font-mono">PRICE</div>
                <div className="text-lg font-mono font-bold">{formatPrice(token.price)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground font-mono">MARKET CAP</div>
                <div className="text-lg font-mono font-bold">{formatUSDT(token.marketCap, true)}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0 h-auto">
            <TabsTrigger
              value="chart"
              data-testid="tab-chart"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3"
            >
              Chart
            </TabsTrigger>
            <TabsTrigger
              value="trades"
              data-testid="tab-trades"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3"
            >
              Trades
            </TabsTrigger>
            <TabsTrigger
              value="dev"
              data-testid="tab-dev"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3"
            >
              Dev Wallet
            </TabsTrigger>
            <TabsTrigger
              value="bundle"
              data-testid="tab-bundle"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3"
            >
              Bundle
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="mt-6">
            <ChartTab tokenAddress={address} />
          </TabsContent>

          <TabsContent value="trades" className="mt-6">
            <TradesTab tokenAddress={address} />
          </TabsContent>

          <TabsContent value="dev" className="mt-6">
            <DevWalletTab tokenAddress={address} />
          </TabsContent>

          <TabsContent value="bundle" className="mt-6">
            <BundleTab tokenAddress={address} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
