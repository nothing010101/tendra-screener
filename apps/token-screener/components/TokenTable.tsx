"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatUsd, derivePriceFromMarketCap, formatRelativeTime, shortenAddress } from "@/lib/format";
import { resolveIpfsUri } from "@/lib/ipfs";
import type { ApeStoreTokenListItem } from "@/lib/apestore";

function TokenLogo({ item }: { item: ApeStoreTokenListItem }) {
  const [broken, setBroken] = useState(false);
  const src = resolveIpfsUri(item.logo);

  if (!src || broken) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel font-mono text-[11px] text-muted">
        {item.symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={item.symbol}
      width={36}
      height={36}
      unoptimized
      onError={() => setBroken(true)}
      className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
    />
  );
}

export function TokenTable({
  items,
  launchCounts = {},
}: {
  items: ApeStoreTokenListItem[];
  launchCounts?: Record<string, number>;
}) {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel text-left text-[11px] uppercase tracking-[0.15em] text-muted">
            <th className="px-4 py-3 font-medium">{t.columns.token}</th>
            <th className="px-4 py-3 font-medium text-right">{t.columns.price}</th>
            <th className="px-4 py-3 font-medium text-right">{t.columns.marketCap}</th>
            <th className="px-4 py-3 font-medium text-right">{t.columns.volume}</th>
            <th className="px-4 py-3 font-medium text-right">{t.columns.holders}</th>
            <th className="px-4 py-3 font-medium text-right">{t.columns.created}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.id}
              onClick={() => router.push(`/token/${item.chain}/${item.address}`)}
              className={`group cursor-pointer border-b border-line/60 transition-colors hover:bg-acid/5 ${
                i % 2 === 1 ? "bg-white/[0.015]" : ""
              }`}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <TokenLogo item={item} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{item.name}</span>
                      {item.isKing && (
                        <span className="rounded-sm bg-acid/15 px-1.5 py-0.5 text-[10px] font-mono text-acid">
                          KING
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted">
                      {item.symbol} · {shortenAddress(item.address)}
                    </div>
                    {/* Creator address + dev badge */}
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted/60">
                      <span>by {shortenAddress(item.creator)}</span>
                      {(launchCounts[item.creator.toLowerCase()] ?? 0) > 1 && (
                        <span
                          title={t.devWallet.tableBadgeTooltip.replace(
                            "{count}",
                            String(launchCounts[item.creator.toLowerCase()]),
                          )}
                          className="rounded-sm bg-bear/15 px-1.5 py-0.5 text-[10px] font-mono text-bear"
                        >
                          ⚠ {t.devWallet.tableBadge} ×{launchCounts[item.creator.toLowerCase()]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono tabular text-ink">
                {formatUsd(derivePriceFromMarketCap(item.marketCap))}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular text-ink">{formatUsd(item.marketCap)}</td>
              <td className="px-4 py-3 text-right font-mono tabular text-muted">
                {item.volumeStat != null ? formatUsd(item.volumeStat.volumeUSD) : "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular text-muted">
                {item.holderCount != null ? (
                  <span
                    title={
                      item.holderUpdatedAt
                        ? t.holdersAsOf.replace("{t}", formatRelativeTime(item.holderUpdatedAt))
                        : undefined
                    }
                  >
                    {item.holderCount >= 1000 ? (
                      <a
                        href={`https://robinhoodchain.blockscout.com/token/${item.address}?tab=holders`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-acid hover:underline"
                      >
                        &gt;1000
                      </a>
                    ) : (
                      item.holderCount.toLocaleString()
                    )}
                    {item.holderUpdatedAt && (
                      <span className="ml-1 text-[10px] text-muted/70">
                        ({t.holdersAsOf.replace("{t}", formatRelativeTime(item.holderUpdatedAt))})
                      </span>
                    )}
                  </span>
                ) : (
                  t.holdersUnavailable
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular text-muted">
                {formatRelativeTime(item.createDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
