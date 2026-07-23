// Bundle analysis — detect coordinated early buyers on Tendra tokens

import type { TendraTrade } from "./tendra";

// Known relay/bridge/protocol addresses to exclude from bundle detection
const EXCLUDED_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  // Add known Stable Chain bridge/relay addresses as they are discovered
]);

export interface Bundle {
  wallets: string[];
  totalUsdt: number;
  totalTokens: number;
  holdPct: number; // % of supply held combined
  firstBuyAt: string;
  lastBuyAt: string;
  windowSec: number; // time span of coordinated buys
}

export interface BundleResult {
  bundles: Bundle[];
  earlyBuyers: string[];
  totalEarlyUsdt: number;
  suppressedCount: number; // wallets excluded (bridge/relay)
}

const WINDOW_MS = 60_000; // 60 seconds — wallets buying within this window are suspicious
const EARLY_TRADE_COUNT = 40; // look at the first N trades

export function analyzeBundles(trades: TendraTrade[]): BundleResult {
  // Sort oldest first — ts is Unix seconds (number)
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const earlyTrades = sorted.slice(0, EARLY_TRADE_COUNT).filter((t) => t.isBuy);

  // Only look at unique buyers
  const seen = new Set<string>();
  const unique: TendraTrade[] = [];
  let suppressedCount = 0;

  for (const t of earlyTrades) {
    const addr = t.trader.toLowerCase();
    if (EXCLUDED_ADDRESSES.has(addr)) {
      suppressedCount++;
      continue;
    }
    if (!seen.has(addr)) {
      seen.add(addr);
      unique.push(t);
    }
  }

  const earlyBuyers = unique.map((t) => t.trader);
  const totalEarlyUsdt = unique.reduce((s, t) => s + t.usdt, 0);

  // Group by time window: wallets that bought within WINDOW_MS of each other
  const bundles: Bundle[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < unique.length; i++) {
    const anchor = unique[i];
    if (assigned.has(anchor.trader.toLowerCase())) continue;

    const anchorTime = new Date(anchor.ts).getTime();
    const group: TendraTrade[] = [anchor];

    for (let j = i + 1; j < unique.length; j++) {
      const other = unique[j];
      if (assigned.has(other.trader.toLowerCase())) continue;
      const otherTime = new Date(other.ts).getTime();
      if (Math.abs(otherTime - anchorTime) <= WINDOW_MS) {
        group.push(other);
      }
    }

    if (group.length >= 2) {
      // Detected a coordinated group
      group.forEach((t) => assigned.add(t.trader.toLowerCase()));

      const totalUsdt = group.reduce((s, t) => s + t.usdt, 0);
      const totalTokens = group.reduce((s, t) => s + t.tokens, 0);
      const holdPct = (totalTokens / 1_000_000_000) * 100;
      const times = group.map((t) => new Date(t.ts).getTime());

      bundles.push({
        wallets: group.map((t) => t.trader),
        totalUsdt,
        totalTokens,
        holdPct,
        firstBuyAt: group.find((t) => new Date(t.ts).getTime() === Math.min(...times))!.ts,
        lastBuyAt: group.find((t) => new Date(t.ts).getTime() === Math.max(...times))!.ts,
        windowSec: (Math.max(...times) - Math.min(...times)) / 1000,
      });
    }
  }

  // Sort bundles by total USDT descending
  bundles.sort((a, b) => b.totalUsdt - a.totalUsdt);

  return { bundles, earlyBuyers, totalEarlyUsdt, suppressedCount };
}
