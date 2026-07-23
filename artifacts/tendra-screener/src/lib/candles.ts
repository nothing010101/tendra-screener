// Build OHLCV candlestick data from Tendra trade history

import type { TendraTrade } from "./tendra";

export interface Candle {
  time: number; // Unix seconds (start of bucket)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // USDT volume
}

export type TimeFrame = "1m" | "5m" | "15m" | "1h" | "4h";

const INTERVALS: Record<TimeFrame, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
};

export function tradesToCandles(trades: TendraTrade[], timeframe: TimeFrame = "5m"): Candle[] {
  if (trades.length === 0) return [];

  const intervalSec = INTERVALS[timeframe];
  const buckets = new Map<number, Candle>();

  for (const trade of trades) {
    // ts is already Unix seconds (number)
    const ts = typeof trade.ts === "number" ? trade.ts : Math.floor(new Date(trade.ts as unknown as string).getTime() / 1000);
    const bucket = Math.floor(ts / intervalSec) * intervalSec;

    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        time: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.usdt,
      });
    } else {
      const candle = buckets.get(bucket)!;
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume += trade.usdt;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// Fill gaps with the previous candle's close price
export function fillCandles(candles: Candle[], timeframe: TimeFrame): Candle[] {
  if (candles.length < 2) return candles;

  const intervalSec = INTERVALS[timeframe];
  const filled: Candle[] = [];
  let prev = candles[0];

  for (let i = 0; i < candles.length; i++) {
    const curr = candles[i];

    // Fill any gap
    let t = prev.time + intervalSec;
    while (t < curr.time) {
      filled.push({
        time: t,
        open: prev.close,
        high: prev.close,
        low: prev.close,
        close: prev.close,
        volume: 0,
      });
      t += intervalSec;
    }

    filled.push(curr);
    prev = curr;
  }

  return filled;
}
