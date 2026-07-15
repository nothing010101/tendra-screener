"use client";

import { useState } from "react";
import { shortenAddress } from "@/lib/format";

interface Bundle {
  funder: string;
  buyers: string[];
}

interface BundlerResult {
  bundles: Bundle[];
  earlyBuyerCount: number;
}

export function BundlerCheck({ chain, address }: { chain: string; address: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<BundlerResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function check() {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch(`/api/token/${chain}/${address}/bundlers`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setStatus("done");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-panel px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
            Bundle Analysis
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-muted/70">
            Checks if early buyers share the same ETH funder — a signal of coordinated supply.
          </p>
        </div>
        {status !== "loading" && (
          <button
            onClick={check}
            className="shrink-0 rounded-md border border-line bg-panel px-4 py-2 font-mono text-xs text-ink hover:border-acid hover:text-acid transition-colors"
          >
            {status === "idle" ? "Check Bundlers" : "Re-check"}
          </button>
        )}
        {status === "loading" && (
          <span className="shrink-0 font-mono text-xs text-muted animate-pulse">
            Checking…
          </span>
        )}
      </div>

      {status === "error" && (
        <p className="mt-3 font-mono text-xs text-bear">{errorMsg}</p>
      )}

      {status === "done" && result && (
        <div className="mt-4 space-y-3">
          <div className="font-mono text-[11px] text-muted">
            Analysed {result.earlyBuyerCount} early buyer{result.earlyBuyerCount !== 1 ? "s" : ""}.
          </div>

          {result.bundles.length === 0 ? (
            <div className="flex items-center gap-2 font-mono text-xs text-muted/80">
              <span className="text-acid">✓</span>
              No bundled wallets detected among early buyers.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-mono text-xs text-bear">
                ⚠ {result.bundles.length} bundle group{result.bundles.length !== 1 ? "s" : ""} detected
              </div>
              {result.bundles.map((bundle, i) => (
                <div key={bundle.funder} className="rounded-md border border-bear/20 bg-bear/5 px-3 py-2.5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted mb-1.5">
                    Group {i + 1} — shared funder
                  </div>
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${bundle.funder}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-acid hover:underline"
                  >
                    {shortenAddress(bundle.funder)}
                  </a>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bundle.buyers.map((buyer) => (
                      <a
                        key={buyer}
                        href={`https://robinhoodchain.blockscout.com/address/${buyer}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] text-muted hover:text-ink"
                      >
                        {shortenAddress(buyer)}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
