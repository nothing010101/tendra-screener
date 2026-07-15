"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { formatUsd, formatRelativeTime, shortenAddress } from "@/lib/format";
import { resolveIpfsUri } from "@/lib/ipfs";
import { TradesTable } from "@/components/TradesTable";
import { DevWalletWarning } from "@/components/DevWalletWarning";
import { FundingTrace } from "@/components/FundingTrace";
import type { ApeStoreTokenDetailResponse, ApeStoreTrade } from "@/lib/apestore";
import type { WalletLaunch } from "@/lib/walletLaunches";
import type { FundingTrace as FundingTraceData } from "@/lib/walletTransfers";

const POLL_MS = 20_000;

export default function TokenDetailPage() {
  const { t } = useLanguage();
  const params = useParams<{ chain: string; address: string }>();
  const [detail, setDetail] = useState<ApeStoreTokenDetailResponse | null>(null);
  const [trades, setTrades] = useState<ApeStoreTrade[]>([]);
  const [otherLaunches, setOtherLaunches] = useState<WalletLaunch[]>([]);
  const [fundingTrace, setFundingTrace] = useState<FundingTraceData | null>(null);
  const [funderFanOut, setFunderFanOut] = useState(0);
  const [fundingStatus, setFundingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not_found">("loading");
  const [tradesStatus, setTradesStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      try {
        const res = await fetch(`/api/token/${params.chain}/${params.address}`);
        if (res.status === 404 || res.status === 502) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 502 && /404/.test(body?.detail ?? "")) {
            if (!cancelled) setStatus("not_found");
            return;
          }
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (!cancelled) {
          setDetail(data);
          setStatus("ready");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    }

    async function loadTrades() {
      try {
        const res = await fetch(`/api/token/${params.chain}/${params.address}/trades`);
        const data = await res.json();
        if (!cancelled) {
          setTrades(Array.isArray(data) ? data : []);
          setTradesStatus("ready");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setTradesStatus("error");
      }
    }

    loadDetail();
    loadTrades();
    const interval = setInterval(() => {
      loadDetail();
      loadTrades();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.chain, params.address]);

  // Phase 3: dev-wallet tracking — once we know the creator, look up other
  // tokens they've launched on this chain (excluding the one we're viewing).
  useEffect(() => {
    let cancelled = false;
    const creator = detail?.token.creator;
    if (!creator) return;

    fetch(`/api/wallet/${creator}/launches`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const currentAddress = params.address?.toLowerCase();
        const launches = (data.launches ?? []).filter(
          (l: WalletLaunch) => l.token_address.toLowerCase() !== currentAddress,
        );
        setOtherLaunches(launches);
      })
      .catch((err) => console.error("[dev-wallet]", err));

    return () => {
      cancelled = true;
    };
  }, [detail?.token.creator, params.address]);

  // Phase 4: wallet funding trace — who first funded this creator wallet, via
  // Alchemy RPC. Fetched once per creator, not on the 20s poll (historical
  // data, and Alchemy calls aren't free).
  useEffect(() => {
    let cancelled = false;
    const creator = detail?.token.creator;
    if (!creator) return;

    setFundingStatus("loading");
    fetch(`/api/wallet/${creator}/funding`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setFundingTrace(data.trace ?? null);
        setFunderFanOut(data.funderFanOut ?? 0);
        setFundingStatus("ready");
      })
      .catch((err) => {
        console.error("[funding-trace]", err);
        if (!cancelled) setFundingStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.token.creator]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas font-mono text-sm text-muted">
        {t.loading}
      </main>
    );
  }

  if (status === "not_found" || (status === "ready" && !detail)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-center">
        <p className="font-mono text-sm text-muted">{t.detail.notFound}</p>
        <Link href="/" className="font-mono text-sm text-acid hover:underline">
          {t.detail.back}
        </Link>
      </main>
    );
  }

  if (status === "error" || !detail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center font-mono text-sm text-bear">
        {t.error}
      </main>
    );
  }

  const { token } = detail;
  const logoSrc = resolveIpfsUri(token.logo);

  return (
    <main className="min-h-screen bg-canvas bg-grid bg-[size:32px_32px]">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-acid">
          ← {t.detail.back}
        </Link>

        <div className="flex flex-wrap items-start gap-4 border-b border-line pb-6">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={token.symbol} className="h-14 w-14 rounded-full border border-line object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel font-mono text-sm text-muted">
              {token.symbol.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-ink">{token.name}</h1>
              {token.isKing && (
                <span className="rounded-sm bg-acid/15 px-1.5 py-0.5 text-[10px] font-mono text-acid">KING</span>
              )}
            </div>
            <p className="font-mono text-sm text-muted">
              {token.symbol} · {shortenAddress(token.address)}
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-acid">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acid" />
            {t.liveBadge}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t.columns.marketCap} value={formatUsd(detail.marketCap)} />
          <Stat label={t.detail.liquidity} value={formatUsd(detail.virtualLiquidity)} />
          <Stat label={t.detail.kingProgress} value={`${detail.kingProgress.toFixed(1)}%`} />
          <Stat label={t.detail.apeProgress} value={`${detail.apeProgress.toFixed(1)}%`} />
        </div>

        <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-muted">
          <span>
            {t.detail.dexPaid}: {detail.dexPaid ? t.detail.dexPaidYes : t.detail.dexPaidNo}
          </span>
          <span>
            {t.columns.holders}: {t.holdersUnavailable}
          </span>
          <span>
            {t.columns.created}: {formatRelativeTime(token.createDate)}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted/70">{t.detail.holdersNote}</p>

        <FundingTrace status={fundingStatus} trace={fundingTrace} funderFanOut={funderFanOut} />

        <DevWalletWarning chain={token.chain} creator={token.creator} otherLaunches={otherLaunches} />

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t.detail.tradesTitle}</h2>
          {tradesStatus === "loading" ? (
            <div className="py-8 text-center font-mono text-sm text-muted">{t.detail.tradesLoading}</div>
          ) : (
            <TradesTable trades={trades} />
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg tabular text-ink">{value}</div>
    </div>
  );
}
