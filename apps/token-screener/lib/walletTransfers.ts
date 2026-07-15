// Phase 4: wallet funding trace.
//
// For a given wallet (typically a token creator flagged in Phase 3), find the
// earliest incoming native transfer via Alchemy RPC — a reasonable proxy for
// "who funded this wallet before it started deploying tokens." We record what
// we find into `wallet_transfers` so repeated views don't re-hit Alchemy, and
// so we can later look for funders who've funded multiple dev wallets.

import { getSupabaseAdmin } from "@/lib/supabase";
import { getEarliestIncomingTransfers } from "@/lib/alchemy";

export interface FundingTrace {
  chain: number;
  from_address: string;
  to_address: string;
  tx_hash: string;
  amount: number | null;
  timestamp: string | null;
}

export async function getFundingTrace(chain: number, address: string): Promise<FundingTrace | null> {
  const supabase = getSupabaseAdmin();
  const normalized = address.toLowerCase();

  // Serve from cache first — funding history doesn't change once observed.
  if (supabase) {
    const { data, error } = await supabase
      .from("wallet_transfers")
      .select("*")
      .eq("chain", chain)
      .eq("to_address", normalized)
      .order("timestamp", { ascending: true })
      .limit(1);
    if (error) console.error("[walletTransfers] cache read failed:", error.message);
    if (data && data.length > 0) return data[0];
  }

  const transfers = await getEarliestIncomingTransfers(address);
  const earliest = transfers[0];
  if (!earliest) return null;

  const trace: FundingTrace = {
    chain,
    from_address: earliest.from.toLowerCase(),
    to_address: normalized,
    tx_hash: earliest.hash,
    amount: earliest.value,
    timestamp: earliest.metadata?.blockTimestamp ?? null,
  };

  if (supabase) {
    const { error } = await supabase.from("wallet_transfers").upsert(
      {
        chain,
        from_address: trace.from_address,
        to_address: trace.to_address,
        tx_hash: trace.tx_hash,
        amount: trace.amount,
        timestamp: trace.timestamp,
      },
      { onConflict: "chain,tx_hash,from_address,to_address" },
    );
    if (error) console.error("[walletTransfers] upsert failed:", error.message);
  }

  return trace;
}

// How many distinct dev wallets (creators, from wallet_launches) has this
// funder address funded, per our recorded history? A funder appearing behind
// several different creators is a hint of a shared operator — full bundle
// heuristics land in Phase 5, this just surfaces the raw count.
export async function getFunderFanOut(chain: number, funderAddress: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("wallet_transfers")
    .select("to_address")
    .eq("chain", chain)
    .eq("from_address", funderAddress.toLowerCase());

  if (error) {
    console.error("[walletTransfers] fan-out query failed:", error.message);
    return 0;
  }
  return new Set((data ?? []).map((row) => row.to_address)).size;
}
