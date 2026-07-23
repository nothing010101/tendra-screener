// Formatting utilities

export function formatUSDT(value: number, compact = false): string {
  if (!isFinite(value) || isNaN(value)) return "$—";
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTokens(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function formatPrice(value: number): string {
  if (!isFinite(value) || isNaN(value) || value === 0) return "$0.000000";
  if (value >= 1)         return `$${value.toFixed(4)}`;
  if (value >= 0.001)     return `$${value.toFixed(6)}`;
  if (value >= 0.000001)  return `$${value.toFixed(8)}`;
  if (value >= 0.00000001) return `$${value.toFixed(10)}`;
  // Below 1e-8 — show fixed with enough decimals, never exponential
  const s = value.toPrecision(4);
  return `$${parseFloat(s).toFixed(12)}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Accept Unix seconds (number) or ISO string */
export function formatTime(ts: number | string): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDate(ts: number | string): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Accept Unix seconds (number) or ISO string */
export function timeAgo(ts: number | string | null): string {
  if (ts == null) return "—";
  const ms = typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
  const diff = (Date.now() - ms) / 1000;
  if (diff < 0) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function gradPct(marketCap: number, gradTarget = 50_000): number {
  return Math.min((marketCap / gradTarget) * 100, 100);
}
