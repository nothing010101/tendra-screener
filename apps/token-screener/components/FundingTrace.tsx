"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import type { FundingTrace as FundingTraceData } from "@/lib/walletTransfers";

// Phase 4: wallet funding trace. Shows who first funded the creator wallet
// (via Alchemy RPC on Robinhood Chain) and how many other dev wallets that
// same funder has funded, per our recorded history.
export function FundingTrace({
  status,
  trace,
  funderFanOut,
}: {
  status: "loading" | "ready" | "error";
  trace: FundingTraceData | null;
  funderFanOut: number;
}) {
  const { t } = useLanguage();

  return (
    <div className="mt-4 rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">{t.funding.title}</div>

      {status === "loading" && <div className="mt-1 font-mono text-xs text-muted">{t.funding.loading}</div>}

      {status === "error" && <div className="mt-1 font-mono text-xs text-muted">{t.funding.none}</div>}

      {status === "ready" && !trace && <div className="mt-1 font-mono text-xs text-muted">{t.funding.none}</div>}

      {status === "ready" && trace && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-ink">
          <span>
            {t.funding.fundedBy}:{" "}
            <a
              href={`https://explorer.robinhood.chain/address/${trace.from_address}`}
              target="_blank"
              rel="noreferrer"
              className="text-acid hover:underline"
            >
              {shortenAddress(trace.from_address)}
            </a>
          </span>
          {trace.amount != null && (
            <span className="text-muted">
              {t.funding.amount}: {trace.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH
            </span>
          )}
          {trace.timestamp && <span className="text-muted">{formatRelativeTime(trace.timestamp)}</span>}
          <a
            href={`https://explorer.robinhood.chain/tx/${trace.tx_hash}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted hover:text-acid"
          >
            {t.funding.txn}: {shortenAddress(trace.tx_hash)}
          </a>
        </div>
      )}

      {status === "ready" && trace && funderFanOut > 1 && (
        <div className="mt-2 rounded-md border border-bear/30 bg-bear/5 px-2.5 py-1.5 font-mono text-[11px] text-bear">
          ⚠ {t.funding.fanOut.replace("{count}", String(funderFanOut))}
        </div>
      )}
    </div>
  );
}
