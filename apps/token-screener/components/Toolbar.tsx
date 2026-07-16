"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

export type SortKey = "marketCap" | "volume" | "name" | "newest";
export type SortOrder = "asc" | "desc";

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (value: SortKey) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (value: SortOrder) => void;
  resultCount: number;
  showSerialDevOnly: boolean;
  onSerialDevOnlyChange: (value: boolean) => void;
}

export function Toolbar({
  search,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  sortOrder,
  onSortOrderChange,
  resultCount,
  showSerialDevOnly,
  onSerialDevOnlyChange,
}: ToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-col gap-2">
        <label className="text-[11px] uppercase tracking-[0.2em] text-muted">
          📈 MC ≥ $5K · {t.resultCount.replace("{count}", String(resultCount))}
        </label>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full max-w-md rounded-md border border-line bg-panel px-4 py-2.5 font-mono text-sm text-ink placeholder:text-muted/70 focus:border-acid focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSerialDevOnlyChange(!showSerialDevOnly)}
          className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
            showSerialDevOnly
              ? "border-bear bg-bear/10 text-bear"
              : "border-line bg-panel text-muted hover:border-bear hover:text-bear"
          }`}
          title="Show only tokens from wallets that have launched multiple tokens"
        >
          ⚠ {t.serialDevFilter}
        </button>
        <select
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
        >
          <option value="marketCap">{t.sort.marketCap}</option>
          <option value="volume">{t.sort.volume}</option>
          <option value="name">{t.sort.name}</option>
          <option value="newest">{t.sort.newest}</option>
        </select>
        <button
          onClick={() => onSortOrderChange(sortOrder === "desc" ? "asc" : "desc")}
          className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs text-ink hover:border-acid"
          title={sortOrder === "desc" ? t.order.desc : t.order.asc}
        >
          {sortOrder === "desc" ? "↓" : "↑"}
        </button>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
