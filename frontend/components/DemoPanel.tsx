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
    <div className="tablet p-5">
      <div className="flex items-center gap-2">
        <h3 className="section-title">Demo controls</h3>
        <span className="chip chip-stone px-2 py-0.5 text-[10px] uppercase tracking-wider">
          testnet
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="field px-2 py-1.5"
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
            className="field w-36 px-2 py-1.5"
          />
          <button
            disabled={busy !== null}
            onClick={() => run("price", () => api.demoSetPrice(token, price))}
            className="btn-stone px-3 py-1.5 text-sm"
          >
            Set price
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            onClick={() => run("rebalance", () => api.demoRebalanceNow(vaultHash))}
            className="btn-stone px-3 py-1.5 text-sm"
          >
            Rebalance now
          </button>
          <button
            disabled={busy !== null || !publicKey}
            onClick={() => run("faucet", () => api.demoFaucet(publicKey as string, "1000000000"))}
            className="btn-stone px-3 py-1.5 text-sm"
          >
            Faucet 1,000 mUSDC
          </button>
        </div>
        {busy && <span className="text-xs text-gold-deep">Running {busy}…</span>}
      </div>
    </div>
  );
}
