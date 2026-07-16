"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toolbar, SortKey, SortOrder } from "@/components/Toolbar";
import { TokenTable } from "@/components/TokenTable";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { ApeStoreTokenListItem } from "@/lib/apestore";

const POLL_MS = 30_000;

type CaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; token: ApeStoreTokenListItem }
  | { status: "not-found" };

export default function HomePage() {
  const { t } = useLanguage();

  // ── MC list ─────────────────────────────────────────────────────────────
  const [items, setItems]               = useState<ApeStoreTokenListItem[]>([]);
  const [listStatus, setListStatus]     = useState<"loading" | "ready" | "error">("loading");
  const [lastUpdated, setLastUpdated]   = useState<number | null>(null);
  const [nowTick, setNowTick]           = useState(0);
  const [launchCounts, setLaunchCounts] = useState<Record<string, number>>({});
  const [search, setSearch]             = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("marketCap");
  const [sortOrder, setSortOrder]       = useState<SortOrder>("desc");
  const [showSerialDevOnly, setShowSerialDevOnly] = useState(false);

  // ── CA search ────────────────────────────────────────────────────────────
  const [caInput, setCaInput] = useState("");
  const [caState, setCaState] = useState<CaState>({ status: "idle" });
  const caInputRef = useRef<HTMLInputElement>(null);

  // 1-second ticker for "updated N s ago"
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const loadList = useCallback(async (force = false) => {
    if (!force && lastUpdated && Date.now() - lastUpdated < POLL_MS - 1_000) return;
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const all: ApeStoreTokenListItem[] = data.items ?? [];
      setItems(all);
      setListStatus("ready");
      setLastUpdated(Date.now());

      const creators = Array.from(new Set(all.map((t) => t.creator)));
      if (creators.length > 0) {
        fetch("/api/wallet/launch-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creators }),
        })
          .then((r) => r.json())
          .then((counts) => setLaunchCounts(counts ?? {}))
          .catch(() => {});
      }
    } catch {
      setListStatus("error");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadList(true);
    const id = setInterval(() => loadList(), POLL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updatedSecondsAgo =
    lastUpdated != null ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;
  void nowTick;

  // ── CA search handler ────────────────────────────────────────────────────
  const searchByCA = useCallback(async (raw: string) => {
    const address = raw.trim();
    if (!address) { setCaState({ status: "idle" }); return; }

    setCaState({ status: "loading" });
    try {
      const res = await fetch(`/api/token/${encodeURIComponent(address)}`);
      if (res.status === 404) { setCaState({ status: "not-found" }); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.token) { setCaState({ status: "not-found" }); return; }
      setCaState({ status: "found", token: data.token });
    } catch {
      setCaState({ status: "not-found" });
    }
  }, []);

  // ── Filtered MC list ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? items.filter((t) => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q))
      : items;

    if (showSerialDevOnly) {
      list = list.filter((t) => (launchCounts[t.creator.toLowerCase()] ?? 0) > 1);
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "marketCap": cmp = (a.marketCap ?? 0) - (b.marketCap ?? 0); break;
        case "volume":    cmp = (a.volumeStat?.volumeUSD ?? 0) - (b.volumeStat?.volumeUSD ?? 0); break;
        case "name":      cmp = a.name.localeCompare(b.name); break;
        case "newest":    cmp = new Date(a.deployDate ?? a.createDate ?? 0).getTime()
                              - new Date(b.deployDate ?? b.createDate ?? 0).getTime(); break;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return list;
  }, [items, search, sortKey, sortOrder, showSerialDevOnly, launchCounts]);

  return (
    <main className="min-h-screen bg-canvas bg-grid bg-[size:32px_32px]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">

        {/* ── Header ── */}
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
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
              <span
                key={lastUpdated}
                className="h-1.5 w-1.5 rounded-full bg-acid2 [animation:ping_0.6s_ease-out_1]"
              />
              {t.updatedAgo.replace("{n}", String(updatedSecondsAgo))}
            </div>
          )}
        </header>

        {/* ── CA Search ── */}
        <div className="mb-6">
          <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Search by Contract Address
          </label>
          <form
            onSubmit={(e) => { e.preventDefault(); searchByCA(caInput); }}
            className="flex gap-2"
          >
            <input
              ref={caInputRef}
              value={caInput}
              onChange={(e) => {
                setCaInput(e.target.value);
                if (!e.target.value.trim()) setCaState({ status: "idle" });
              }}
              placeholder="Paste contract address (0x…)"
              className="flex-1 rounded-md border border-line bg-panel px-4 py-2.5 font-mono text-sm text-ink placeholder:text-muted/60 focus:border-acid focus:outline-none"
            />
            <button
              type="submit"
              disabled={caState.status === "loading"}
              className="rounded-md border border-acid bg-acid/10 px-5 py-2.5 font-mono text-xs font-semibold text-acid transition-colors hover:bg-acid/20 disabled:opacity-50"
            >
              {caState.status === "loading" ? "Searching…" : "Search"}
            </button>
            {caState.status !== "idle" && (
              <button
                type="button"
                onClick={() => { setCaInput(""); setCaState({ status: "idle" }); }}
                className="rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-xs text-muted hover:text-ink"
              >
                ✕
              </button>
            )}
          </form>

          {/* CA result */}
          {caState.status === "loading" && (
            <div className="mt-3 flex items-center gap-2 font-mono text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-acid" />
              Searching ape.store…
            </div>
          )}
          {caState.status === "not-found" && (
            <div className="mt-3 rounded-md border border-bear/30 bg-bear/5 px-4 py-3 font-mono text-sm text-bear">
              Token not found on Robinhood Chain.
            </div>
          )}
          {caState.status === "found" && (
            <div className="mt-3">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-acid">
                Token found
              </p>
              <TokenTable items={[caState.token]} launchCounts={launchCounts} />
            </div>
          )}
        </div>

        {/* ── MC list ── */}
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
          {listStatus === "loading" && (
            <div className="flex items-center justify-center gap-3 py-16 font-mono text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-acid" />
              {t.loading}
            </div>
          )}
          {listStatus === "error" && (
            <div className="rounded-lg border border-bear/30 bg-bear/5 px-4 py-6 text-center text-sm text-bear">
              {t.error}
            </div>
          )}
          {listStatus === "ready" && filtered.length === 0 && (
            <div className="rounded-lg border border-line bg-panel px-4 py-16 text-center text-sm text-muted">
              {t.empty}
            </div>
          )}
          {listStatus === "ready" && filtered.length > 0 && (
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
