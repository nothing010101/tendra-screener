// Standalone polling worker — single source of truth for ape.store data.
//
// Responsibilities:
//   1. Fetch all live tokens from ape.store every POLL_INTERVAL_MS (30s).
//   2. Upsert full token snapshots into the Supabase `tokens` table so the
//      Next.js screener can read from one Supabase query instead of 129
//      paginated ape.store API calls.
//   3. Record creator → token mappings in wallet_launches (dev-wallet tracking).
//   4. Refresh holder counts from Alchemy on a slower cadence (every 2 min).
//
// ape.store API must ONLY be called from this process — never from the
// Next.js app or its API routes.

import {
  fetchAllLiveTokens,
  recordTokenLaunches,
  upsertTokenSnapshot,
  ROBINHOOD_CHAIN_ID,
  computeTokenHolderCount,
  getCachedHolderCounts,
  upsertHolderCount,
  selectStaleAddresses,
} from "@workspace/screener-core";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30_000);

// Holder counts require a full on-chain Transfer-history scan per token via
// Alchemy — far too slow/expensive to do on every 30s poll. Refresh on a much
// slower cadence instead, and only for addresses whose cached value is
// missing or older than the refresh interval itself.
//
// Tuned for the real live-token total after the ape.store pagination fix
// (~2,900 tokens, not the ~192 an earlier hardcoded page cap was capturing).
// 60 tokens every 2 minutes = 30/min, sequential (one Alchemy call at a time,
// well under rate-limit risk) — a full first pass over every token takes
// roughly (liveTokenCount / 60) * 2 minutes; see the startup log for the
// concrete estimate against the current live count.
const HOLDER_REFRESH_INTERVAL_MS = Number(process.env.HOLDER_REFRESH_INTERVAL_MS ?? 2 * 60_000);
// Cap how many tokens get a holder-count recompute per cycle so a sudden
// burst of new launches can't turn one tick into hundreds of Alchemy calls.
const HOLDER_REFRESH_BATCH_SIZE = Number(process.env.HOLDER_REFRESH_BATCH_SIZE ?? 60);

let stopping = false;
let inFlight = false;
let latestLiveAddresses: string[] = [];
// Same addresses as latestLiveAddresses, but ordered highest volume/market
// cap first — so the tokens people actually care about get a holder count
// long before a full pass over the whole live list finishes.
let latestPrioritizedAddresses: string[] = [];
let holderRefreshInFlight = false;

async function pollOnce(): Promise<void> {
  if (inFlight) {
    // Guard against overlapping runs if ape.store is slow to respond and the
    // interval fires again before the previous poll finished.
    console.warn("[worker] previous poll still running, skipping this tick");
    return;
  }
  inFlight = true;
  const startedAt = Date.now();
  try {
    const items = await fetchAllLiveTokens(ROBINHOOD_CHAIN_ID);
    // Run snapshot upsert and launch-record in parallel — independent writes.
    await Promise.all([
      upsertTokenSnapshot(ROBINHOOD_CHAIN_ID, items),
      recordTokenLaunches(items),
    ]);
    latestLiveAddresses = items.map((item) => item.address);
    // Highest market cap first, ties broken by volume — the pairs most
    // people are actually looking at get a real holder count first, instead
    // of an arbitrary ape.store page-order pass.
    latestPrioritizedAddresses = [...items]
      .sort((a, b) => {
        const marketCapDiff = (b.marketCap ?? 0) - (a.marketCap ?? 0);
        if (marketCapDiff !== 0) return marketCapDiff;
        return (b.volumeStat?.volumeUSD ?? 0) - (a.volumeStat?.volumeUSD ?? 0);
      })
      .map((item) => item.address);
    console.log(
      `[worker] polled ${items.length} live tokens on chain ${ROBINHOOD_CHAIN_ID} in ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    // A single failed poll must never crash the process — just log and let
    // the next tick retry.
    console.error("[worker] poll failed:", (err as Error).message);
  } finally {
    inFlight = false;
  }
}

async function refreshHolderCountsOnce(): Promise<void> {
  if (holderRefreshInFlight) {
    console.warn("[worker] previous holder-count refresh still running, skipping this tick");
    return;
  }
  if (!process.env.ALCHEMY_RPC) {
    // Not configured — skip silently rather than spamming errors every cycle.
    return;
  }
  if (latestPrioritizedAddresses.length === 0) return;

  holderRefreshInFlight = true;
  const startedAt = Date.now();
  try {
    const cached = await getCachedHolderCounts(ROBINHOOD_CHAIN_ID, latestPrioritizedAddresses);
    // selectStaleAddresses() only filters staleness — it doesn't sort, so
    // the market-cap/volume ordering from latestPrioritizedAddresses is
    // preserved through the slice below.
    const stale = selectStaleAddresses(latestPrioritizedAddresses, cached, HOLDER_REFRESH_INTERVAL_MS).slice(
      0,
      HOLDER_REFRESH_BATCH_SIZE,
    );
    if (stale.length === 0) return;

    // Small inter-call delay between tokens so bursts of Alchemy
    // alchemy_getAssetTransfers calls stay well under rate-limit thresholds.
    const INTER_TOKEN_DELAY_MS = 300;

    let ok = 0;
    for (const address of stale) {
      try {
        const holderCount = await computeTokenHolderCount(address);
        await upsertHolderCount(ROBINHOOD_CHAIN_ID, address, holderCount);
        ok++;
      } catch (err) {
        console.error(`[worker] holder-count refresh failed for ${address}:`, (err as Error).message);
      }
      // Throttle regardless of success/failure so a run of errors doesn't
      // collapse the inter-call gap to zero.
      await new Promise((r) => setTimeout(r, INTER_TOKEN_DELAY_MS));
    }
    console.log(
      `[worker] refreshed holder counts for ${ok}/${stale.length} tokens in ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    console.error("[worker] holder-count refresh cycle failed:", (err as Error).message);
  } finally {
    holderRefreshInFlight = false;
  }
}

async function main() {
  console.log(`[worker] starting — polling ape.store every ${POLL_INTERVAL_MS}ms`);

  // Optional health-check server: only bound if Railway (or any host) injects
  // a PORT. The worker's real job needs no inbound traffic, but some hosting
  // setups expect a port to open before treating a service as healthy.
  const rawPort = process.env.PORT;
  if (rawPort) {
    const { createServer } = await import("node:http");
    const port = Number(rawPort);
    createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    }).listen(port, () => console.log(`[worker] health check server listening on ${port}`));
  }

  await pollOnce();

  // Log a concrete time estimate for how long a full first holder-count pass
  // will take, so it's visible in production logs whenever the worker restarts.
  if (latestPrioritizedAddresses.length > 0) {
    const cycles = Math.ceil(latestPrioritizedAddresses.length / HOLDER_REFRESH_BATCH_SIZE);
    const estimateMinutes = Math.ceil((cycles * HOLDER_REFRESH_INTERVAL_MS) / 60_000);
    console.log(
      `[worker] holder-count estimate: ${latestPrioritizedAddresses.length} tokens / ${HOLDER_REFRESH_BATCH_SIZE} per cycle` +
      ` / every ${HOLDER_REFRESH_INTERVAL_MS / 1000}s ≈ ${cycles} cycles ≈ ${estimateMinutes} min for first full pass` +
      ` (tokens ordered by market cap desc — highest-value tokens get counts first)`,
    );
  }

  const timer = setInterval(() => {
    if (!stopping) void pollOnce();
  }, POLL_INTERVAL_MS);

  const holderTimer = setInterval(() => {
    if (!stopping) void refreshHolderCountsOnce();
  }, HOLDER_REFRESH_INTERVAL_MS);
  // Kick off an initial refresh shortly after the first poll populates
  // latestPrioritizedAddresses, rather than waiting a full interval.
  setTimeout(() => void refreshHolderCountsOnce(), 15_000);

  const shutdown = (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down`);
    stopping = true;
    clearInterval(timer);
    clearInterval(holderTimer);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});
