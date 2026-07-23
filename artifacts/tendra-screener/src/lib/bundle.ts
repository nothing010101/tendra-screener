// Bundle analysis — detect coordinated early buyers on Tendra tokens

import type { TendraTrade } from "./tendra";
import { TENDRA_CONTRACT } from "./rpc";

// Known relay/protocol/contract addresses to exclude from bundle detection.
// The Tendra factory contract itself trades as part of bonding curve mechanics —
// it should never be flagged as a bundler.
const EXCLUDED_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  TENDRA_CONTRACT.toLowerCase(),
]);

export interface Bundle {
  wallets: string[];
  totalUsdt: number;
  totalTokens: number;
  holdPct: number;       // % of supply held combined
  firstBuyAt: number;   // Unix seconds
  lastBuyAt: number;    // Unix seconds
  windowSec: number;    // time span of coordinated buys
}

export interface BundleResult {
  bundles: Bundle[];
  earlyBuyers: string[];
  totalEarlyUsdt: number;
  suppressedCount: number; // wallets excluded (contract/relay)
}

const WINDOW_SEC = 60;     // 60 seconds — wallets buying within this window are suspicious
const EARLY_TRADE_COUNT = 40; // look at the first N trades

export function analyzeBundles(trades: TendraTrade[]): BundleResult {
  // Sort oldest first — ts is Unix seconds (number)
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const earlyTrades = sorted.slice(0, EARLY_TRADE_COUNT).filter((t) => t.isBuy);

  // Deduplicate wallets, exclude protocol addresses
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

  // Group by time window: wallets buying within WINDOW_SEC of each other
  const bundles: Bundle[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < unique.length; i++) {
    const anchor = unique[i];
    if (assigned.has(anchor.trader.toLowerCase())) continue;

    // ts is Unix seconds — compare directly (no Date conversion)
    const anchorTs = anchor.ts;
    const group: TendraTrade[] = [anchor];

    for (let j = i + 1; j < unique.length; j++) {
      const other = unique[j];
      if (assigned.has(other.trader.toLowerCase())) continue;
      if (Math.abs(other.ts - anchorTs) <= WINDOW_SEC) {
        group.push(other);
      }
    }

    if (group.length >= 2) {
      group.forEach((t) => assigned.add(t.trader.toLowerCase()));

      const totalUsdt = group.reduce((s, t) => s + t.usdt, 0);
      const totalTokens = group.reduce((s, t) => s + t.tokens, 0);
      const holdPct = (totalTokens / 1_000_000_000) * 100;
      const tsList = group.map((t) => t.ts);
      const minTs = Math.min(...tsList);
      const maxTs = Math.max(...tsList);

      bundles.push({
        wallets: group.map((t) => t.trader),
        totalUsdt,
        totalTokens,
        holdPct,
        firstBuyAt: minTs,
        lastBuyAt: maxTs,
        windowSec: maxTs - minTs,
      });
    }
  }

  bundles.sort((a, b) => b.totalUsdt - a.totalUsdt);

  return { bundles, earlyBuyers, totalEarlyUsdt, suppressedCount };
}
