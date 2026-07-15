"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import type { WalletLaunch } from "@/lib/walletLaunches";

// Phase 3: dev-wallet tracking. Shown on the token detail page when the
// creator has launched other tokens on Robinhood Chain (per our recorded
// history). This is a warning based on observed data, not proof of intent.
export function DevWalletWarning({
  chain,
  creator,
  otherLaunches,
}: {
  chain: number;
  creator: string;
  otherLaunches: WalletLaunch[];
}) {
  const { t } = useLanguage();

  if (otherLaunches.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-bear/30 bg-bear/5 px-4 py-4">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-bear">
        <span>⚠</span>
        {t.devWallet.warningTitle}
      </div>
      <p className="mt-1 font-mono text-xs text-muted">
        {t.devWallet.warningBody.replace("{count}", String(otherLaunches.length))}
      </p>

      <div className="mt-3 space-y-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
          {t.devWallet.otherLaunchesTitle}
        </div>
        {otherLaunches.map((launch) => (
          <div
            key={launch.token_address}
            className="flex items-center justify-between gap-3 rounded-md border border-line/60 bg-panel px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-ink">
                {launch.token_name ?? shortenAddress(launch.token_address)}{" "}
                {launch.token_symbol && <span className="text-muted">· {launch.token_symbol}</span>}
              </div>
              <div className="font-mono text-[11px] text-muted">
                {shortenAddress(launch.token_address)}
                {launch.deploy_date && <> · {formatRelativeTime(launch.deploy_date)}</>}
              </div>
            </div>
            <Link
              href={`/token/${chain}/${launch.token_address}`}
              className="shrink-0 font-mono text-[11px] text-acid hover:underline"
            >
              {t.devWallet.viewToken}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-3 font-mono text-[11px] text-muted">
        {t.devWallet.tableBadge}: <span className="text-ink">{shortenAddress(creator)}</span>
      </div>
    </div>
  );
}
