"use client";

/**
 * Testnet demo controls, wired to backend demo endpoints. Kept visually
 * separate from real user actions (golden rule: demo-ready, clearly marked).
 * These let the rebalance + agent rationale be shown live on stage.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/hooks/use-wallet";
import { ASSET_SYMBOLS } from "@/lib/constants";

export function DemoPanel({ vaultHash }: { vaultHash: string }) {
  const { publicKey } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [token, setToken] = useState<string>(ASSET_SYMBOLS[1]);
  const [price, setPrice] = useState("");

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50/40 p-4">
      <h3 className="text-sm font-semibold text-amber-700">Demo controls (testnet)</h3>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="rounded border border-foreground/15 bg-transparent px-2 py-1"
          >
            {ASSET_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="price (6dp raw)"
            className="w-36 rounded border border-foreground/15 bg-transparent px-2 py-1"
          />
          <button
            disabled={busy !== null}
            onClick={() => run("price", () => api.demoSetPrice(token, price))}
            className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
          >
            Set price
          </button>
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy !== null}
            onClick={() => run("rebalance", () => api.demoRebalanceNow(vaultHash))}
            className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
          >
            Rebalance now
          </button>
          <button
            disabled={busy !== null || !publicKey}
            onClick={() => run("faucet", () => api.demoFaucet(publicKey as string, "1000000000"))}
            className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
          >
            Faucet 1,000 mUSDC
          </button>
        </div>
        {busy && <span className="text-xs text-amber-700">Running {busy}…</span>}
      </div>
    </div>
  );
}
