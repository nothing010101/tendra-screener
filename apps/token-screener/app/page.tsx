"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toolbar, SortKey, SortOrder } from "@/components/Toolbar";
import { TokenTable } from "@/components/TokenTable";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { ApeStoreTokenListItem } from "@/lib/apestore";

// Tokens are now served from Supabase via /api/tokens in a single request.
// Sort is handled server-side (ORDER BY in Supabase). Search is client-side
// because data is already in memory and instant filtering beats a round-trip.
// When sort changes, we re-fetch with the new sort params.

export default function HomePage() {
  const { t } = useLanguage();
  const [items, setItems]                   = useState<ApeStoreTokenListItem[]>([]);
  const [status, setStatus]                 = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch]                 = useState("");
  const [sortKey, setSortKey]               = useState<SortKey>("marketCap");
  const [sortOrder, setSortOrder]           = useState<SortOrder>("desc");
  const [launchCounts, setLaunchCounts]     = useState<Record<string, number>>({});
  const [showSerialDevOnly, setShowSerialDevOnly] = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<number | null>(null);
  const [nowTick, setNowTick]               = useState(0);

  // Drive the "updated Ns ago" counter.
  useEffect(() => {
    const tick = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // Keep a ref to the latest sort values so the polling interval always uses
  // the current sort without needing to be re-created on every change.
  const sortRef = useRef({ sortKey, sortOrder });
  useEffect(() => { sortRef.current = { sortKey, sortOrder }; }, [sortKey, sortOrder]);

  const fetchTokens = useCallback(async (sk: SortKey, so: SortOrder, signal?: AbortSignal) => {
    const res = await fetch(`/api/tokens?sort=${sk}&order=${so}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      try {
        const { sk, so } = { sk: sortRef.current.sortKey, so: sortRef.current.sortOrder };
        const data = await fetchTokens(sk, so, ac.signal);
        if (data.error) throw new Error(data.error);

        const all: ApeStoreTokenListItem[] = data.items ?? [];
        if (!cancelled) {
          setItems(all);
          setStatus("ready");
          setLastUpdated(Date.now());
        }

        // Serial-dev tracking: fetch how many tokens each creator has launched.
        const creators = Array.from(new Set(all.map((item) => item.creator)));
        if (creators.length > 0 && !cancelled) {
          fetch("/api/wallet/launch-counts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creators }),
          })
            .then((r) => r.json())
            .then((counts) => { if (!cancelled) setLaunchCounts(counts ?? {}); })
            .catch((err) => console.error("[launch-counts]", err));
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    }

    load();
    // Re-poll every 30s to stay in sync with the worker's upsert cadence.
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(interval);
    };
  // Re-run when sort changes so the new sort is reflected immediately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortOrder, fetchTokens]);

  const updatedSecondsAgo =
    lastUpdated != null ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;
  void nowTick;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Server already sorted; client only filters (search + serial-dev toggle).
    let list = q
      ? items.filter((t) => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q))
      : items;

    if (showSerialDevOnly) {
      list = list.filter((t) => (launchCounts[t.creator.toLowerCase()] ?? 0) > 1);
    }

    return list;
  }, [items, search, showSerialDevOnly, launchCounts]);

  return (
    <main className="min-h-screen bg-canvas bg-grid bg-[size:32px_32px]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
              <span className="h-1.5 w-1.5 rounded-full bg-acid" />
              {t.liveBadge} · Robinhood Chain · 4663
            </div>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{t.brand}</h1>
            <p className="mt-1 text-sm text-muted">{t.tagline}</p>
          </div>
          {updatedSecondsAgo != null && (
            <div
              className="flex items-center gap-1.5 font-mono text-[11px] text-muted"
              title={t.updatedAgo.replace("{n}", String(updatedSecondsAgo))}
            >
              <span
                key={lastUpdated}
                className="h-1.5 w-1.5 rounded-full bg-acid2 [animation:ping_0.6s_ease-out_1]"
              />
              {t.updatedAgo.replace("{n}", String(updatedSecondsAgo))}
            </div>
          )}
        </header>

        <Toolbar
          search={search}
          onSearchChange={setSearch}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          resultCount={filtered.length}
          showSerialDevOnly={showSerialDevOnly}
          onSerialDevOnlyChange={setShowSerialDevOnly}
        />

        <div className="mt-6">
          {status === "loading" && (
            <div className="flex items-center gap-3 py-16 justify-center font-mono text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-acid" />
              {t.loading}
            </div>
          )}
          {status === "error" && (
            <div className="rounded-lg border border-bear/30 bg-bear/5 px-4 py-6 text-center text-sm text-bear">
              {t.error}
            </div>
          )}
          {status === "ready" && filtered.length === 0 && (
            <div className="rounded-lg border border-line bg-panel px-4 py-16 text-center text-sm text-muted">
              {t.empty}
            </div>
          )}
          {status === "ready" && filtered.length > 0 && (
            <TokenTable items={filtered} launchCounts={launchCounts} />
          )}
        </div>

        <footer className="mt-10 border-t border-line pt-5 text-center font-mono text-[11px] text-muted">
          {t.footerNote}
        </footer>
      </div>
    </main>
  );
}
