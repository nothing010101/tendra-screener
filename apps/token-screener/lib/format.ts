export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 0.01) return `${value.toFixed(2)}`;
  // Sub-cent values (meme-coin prices, dust volume): show fixed-point with
  // enough decimals to reveal real digits instead of ugly/confusing
  // scientific notation like "$4.15e-13".
  const decimals = Math.min(12, Math.max(2, -Math.floor(Math.log10(abs)) + 2));
  const fixed = value.toFixed(decimals);
  if (Number(fixed) === 0) return `<${(1 / 10 ** decimals).toFixed(decimals)}`;
  return `${fixed}`;
}

// ape.store's list endpoint (`/api/tokens`) does not return a ready-to-use
// USD price per token — `priceAfter`/`price` are raw internal bonding-curve
// integers on an undocumented scale, not dollars. Its detail endpoint
// (`/api/token/:chain/:address`) *does* return a proper `currentPrice`, and
// empirically `marketCap = currentPrice * totalSupply` with a total supply
// constant of ~1,000,000,000 across every token observed on this chain (the
// standard pump.fun-style launch supply). Since the list endpoint's
// `marketCap` field is already correct, we can derive an accurate display
// price from it directly without a per-token detail request.
const ASSUMED_TOTAL_SUPPLY = 1_000_000_000;

export function derivePriceFromMarketCap(marketCap: number | null | undefined): number | null {
  if (marketCap == null || Number.isNaN(marketCap)) return null;
  return marketCap / ASSUMED_TOTAL_SUPPLY;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function shortenAddress(address: string | null | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
