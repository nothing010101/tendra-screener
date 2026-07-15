"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { shortenAddress } from "@/lib/format";
import type { ApeStoreTrade } from "@/lib/apestore";

function timeAgo(iso: string): string {
  const date = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}

export function TradesTable({ trades }: { trades: ApeStoreTrade[] }) {
  const { t } = useLanguage();

  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel px-4 py-10 text-center text-sm text-muted">
        {t.detail.tradesEmpty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel text-left text-[11px] uppercase tracking-[0.15em] text-muted">
            <th className="px-4 py-3 font-medium">{t.detail.columns.wallet}</th>
            <th className="px-4 py-3 font-medium">{t.detail.columns.side}</th>
            <th className="px-4 py-3 font-medium text-right">{t.detail.columns.amount}</th>
            <th className="px-4 py-3 font-medium text-right">{t.detail.columns.time}</th>
            <th className="px-4 py-3 font-medium text-right">{t.detail.columns.txn}</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 50).map((trade) => {
            const isBuy = Number(trade.tokenOut) > 0;
            return (
              <tr key={trade.id} className="border-b border-line/60">
                <td className="px-4 py-3 font-mono text-xs text-ink">{shortenAddress(trade.to)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${
                      isBuy ? "bg-acid/15 text-acid" : "bg-bear/15 text-bear"
                    }`}
                  >
                    {isBuy ? t.detail.side.buy : t.detail.side.sell}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular text-muted">
                  {Math.abs(trade.tokenChange).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular text-muted">{timeAgo(trade.timeStamp)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                  <a
                    href={`https://robinhoodchain.blockscout.com/tx/${trade.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-acid"
                  >
                    {shortenAddress(trade.transactionHash)}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
