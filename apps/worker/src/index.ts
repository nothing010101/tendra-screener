// Standalone dev-wallet tracking worker.
//
// The Next.js app only calls recordTokenLaunches() when a browser has the
// screener page open (it happens inside the /api/tokens route handler, which
// only runs on incoming requests). That means wallet_launches history has
// gaps whenever nobody is looking at the site.
//
// This process closes that gap: it runs continuously on its own (deployed as
// a long-running Railway service, not a serverless function) and polls
// ape.store directly on a fixed interval, independent of any user traffic.
// It shares the exact same recordTokenLaunches() implementation from
// @workspace/screener-core — no duplicated upsert logic.

import { fetchAllLiveTokens, recordTokenLaunches, ROBINHOOD_CHAIN_ID } from "@workspace/screener-core";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30_000);

let stopping = false;
let inFlight = false;

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
    await recordTokenLaunches(items);
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
  const timer = setInterval(() => {
    if (!stopping) void pollOnce();
  }, POLL_INTERVAL_MS);

  const shutdown = (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down`);
    stopping = true;
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});
