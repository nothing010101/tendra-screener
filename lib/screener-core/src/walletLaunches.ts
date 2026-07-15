// Phase 3: dev-wallet tracking.
//
// Every time we fetch tokens from ape.store (list or detail), we upsert a row
// per token into `wallet_launches` keyed on (chain, token_address). Over time
// this builds a history of which wallets ("devs") have launched which tokens,
// so we can warn when a token's creator has launched others on Robinhood Chain.
//
// This is best-effort: if Supabase isn't configured or a write fails, we log
// and move on — dev-wallet tracking must never break the core screener.
//
// Called from two independent places: the Next.js app's `/api/tokens` route
// (only while a browser tab has the screener open) and the standalone worker
// in apps/worker (polls continuously regardless of traffic). Both go through
// this single implementation so there is one source of truth for the upsert
// logic.

import { getSupabaseAdmin } from "./supabase";
import type { ApeStoreTokenListItem } from "./apestore";

export interface WalletLaunch {
  chain: number;
  creator_address: string;
  token_address: string;
  token_name: string | null;
  token_symbol: string | null;
  deploy_date: string | null;
  created_at: string;
}

export async function recordTokenLaunches(items: ApeStoreTokenListItem[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || items.length === 0) return;

  const rows = items
    .filter((item) => !!item.creator && !!item.address)
    .map((item) => ({
      chain: item.chain,
      creator_address: item.creator.toLowerCase(),
      token_address: item.address.toLowerCase(),
      token_name: item.name,
      token_symbol: item.symbol,
      deploy_date: item.deployDate ?? item.createDate ?? null,
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from("wallet_launches").upsert(rows, { onConflict: "chain,token_address" });
  if (error) console.error("[walletLaunches] upsert failed:", error.message);
}

export async function getLaunchesByCreator(chain: number, creatorAddress: string): Promise<WalletLaunch[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("wallet_launches")
    .select("*")
    .eq("chain", chain)
    .eq("creator_address", creatorAddress.toLowerCase())
    .order("deploy_date", { ascending: false });

  if (error) {
    console.error("[walletLaunches] query by creator failed:", error.message);
    return [];
  }
  return data ?? [];
}

// Batched lookup for the list view: given a set of creator addresses, return
// how many distinct tokens each has launched on this chain (per our recorded
// history — a lower bound, since we only know what we've observed).
export async function getLaunchCountsByCreators(
  chain: number,
  creatorAddresses: string[],
): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  const unique = Array.from(new Set(creatorAddresses.map((a) => a.toLowerCase())));
  if (!supabase || unique.length === 0) return {};

  const { data, error } = await supabase
    .from("wallet_launches")
    .select("creator_address, token_address")
    .eq("chain", chain)
    .in("creator_address", unique);

  if (error) {
    console.error("[walletLaunches] query counts failed:", error.message);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.creator_address] = (counts[row.creator_address] ?? 0) + 1;
  }
  return counts;
}
