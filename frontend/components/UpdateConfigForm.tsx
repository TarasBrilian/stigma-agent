"use client";

/**
 * Owner-only `Vault.update_config` — edit the growth-tilted START allocation
 * (`base_allocation`, bps) + the goal (amount + year). The contract re-validates
 * Σ == 10000 + asset membership on write; we also gate submit on Σ to avoid a
 * guaranteed revert. This edits the BASE allocation, NOT the glide-adjusted current
 * target (golden rule #4 — the UI never re-derives that).
 * 🔴 golden rule #1 (USER action) · #2 (bps passed through, validated on-chain).
 */

import { useState } from "react";
import { buildUpdateConfigDeploy } from "@/lib/casper";
import { parseUsdToRaw, usd6ToPlain } from "@/lib/format";
import { ASSETS, ASSET_SYMBOLS, BPS_TOTAL } from "@/lib/constants";
import { useWallet } from "@/hooks/use-wallet";
import { useSignedAction } from "@/hooks/use-signed-action";
import type { Allocation, AssetSymbol, Usd6 } from "@/lib/types";

export function UpdateConfigForm({
  vaultHash,
  baseAllocation,
  targetAmountUsd,
  targetYear,
}: {
  vaultHash: string;
  baseAllocation: Allocation;
  targetAmountUsd: Usd6;
  targetYear: number;
}) {
  const { isConnected } = useWallet();
  const { status, error, busy, run, setError } = useSignedAction();
  const [bps, setBps] = useState<Record<AssetSymbol, string>>(
    () =>
      Object.fromEntries(
        ASSET_SYMBOLS.map((s) => [s, String(baseAllocation[s] ?? 0)]),
      ) as Record<AssetSymbol, string>,
  );
  const [amount, setAmount] = useState(usd6ToPlain(targetAmountUsd));
  const [year, setYear] = useState(String(targetYear));

  // Display/validation only — the executed weights are the bps the user typed,
  // re-validated on-chain. This just avoids submitting a guaranteed revert.
  const sum = ASSET_SYMBOLS.reduce((acc, s) => acc + (Number(bps[s]) || 0), 0);
  const balanced = sum === BPS_TOTAL;

  const submit = () => {
    let raw: string;
    try {
      raw = parseUsdToRaw(amount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid goal amount.");
      return;
    }
    const yr = Number(year);
    if (!Number.isInteger(yr) || yr < 1970) {
      setError("Enter a valid target year.");
      return;
    }
    const allocation: Allocation = Object.fromEntries(
      ASSET_SYMBOLS.map((s) => [s, Number(bps[s]) || 0]),
    );
    void run((pk) =>
      buildUpdateConfigDeploy(pk, vaultHash, {
        allocation,
        targetAmountUsd: raw,
        targetYear: yr,
      }),
    );
  };

  if (!isConnected) return null;

  return (
    <section className="relief-panel p-5">
      <h2 className="section-title mb-4">Edit configuration</h2>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ASSET_SYMBOLS.map((s) => (
            <label key={s} className="flex flex-col gap-1 text-xs text-ink-soft">
              <span>{ASSETS[s].label} (bps)</span>
              <input
                inputMode="numeric"
                value={bps[s]}
                onChange={(e) => setBps((b) => ({ ...b, [s]: e.target.value }))}
                disabled={busy}
                className="field px-2 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
        <p className={`text-xs ${balanced ? "text-patina" : "text-terracotta"}`}>
          Σ {sum} / {BPS_TOTAL} bps {balanced ? "✓" : "(must total 10000)"}
        </p>

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink-soft">
            <span>Goal ($)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="field px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs text-ink-soft">
            <span>Year</span>
            <input
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={busy}
              className="field px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <button
          onClick={() => void submit()}
          disabled={busy || !balanced}
          className="btn-gold self-start px-4 py-2 text-sm"
        >
          {busy ? "Working…" : "Save changes"}
        </button>
        {status === "signing" && (
          <p className="text-xs text-gold-deep">Sign the update in your wallet…</p>
        )}
        {status === "confirming" && (
          <p className="text-xs text-gold-deep">Confirming on-chain (~8s)…</p>
        )}
        {status === "done" && <p className="text-xs text-patina">Configuration updated.</p>}
        {error && <p className="text-xs text-terracotta">{error}</p>}
      </div>
    </section>
  );
}
