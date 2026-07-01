"use client";

/**
 * Real USER withdrawal from a vault: sign `Vault.withdraw(amount)` or `withdraw_all()`
 * (owner-only). A partial withdraw liquidates ALL holdings to mUSDC, sends `amount`,
 * and leaves the remainder as idle cash until the agent re-buys — surfaced below.
 * 🔴 golden rule #1: only USER actions are signed here — never an agent action.
 */

import { useState } from "react";
import { buildWithdrawDeploy } from "@/lib/casper";
import { parseUsdToRaw, truncateHash } from "@/lib/format";
import { useWallet } from "@/hooks/use-wallet";
import { useSignedAction } from "@/hooks/use-signed-action";
import type { Usd6 } from "@/lib/types";

export function WithdrawForm({ vaultHash }: { vaultHash: string }) {
  const { isConnected } = useWallet();
  const { status, txHash, error, busy, run, setError } = useSignedAction();
  const [amount, setAmount] = useState("");

  const withdraw = (amountOrAll: Usd6 | "all") =>
    void run((pk) => buildWithdrawDeploy(pk, vaultHash, amountOrAll));

  const withdrawAmount = () => {
    let raw: string;
    try {
      raw = parseUsdToRaw(amount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid amount.");
      return;
    }
    withdraw(raw);
  };

  // The DepositForm above already prompts to connect — keep this hidden until then.
  if (!isConnected) return null;

  return (
    <section className="relief-panel p-5">
      <h2 className="section-title mb-4">Withdraw</h2>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-soft">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && withdrawAmount()}
            placeholder="100.00"
            disabled={busy}
            className="field flex-1 px-3 py-2 text-sm"
          />
          <button
            onClick={withdrawAmount}
            disabled={busy || amount.trim() === ""}
            className="btn-stone px-4 py-2 text-sm"
          >
            Withdraw
          </button>
        </div>
        <button
          onClick={() => withdraw("all")}
          disabled={busy}
          className="btn-stone self-start px-3 py-1.5 text-xs"
        >
          Withdraw all
        </button>
        <p className="text-xs text-ink-faint">
          Withdrawing sells ALL holdings to mUSDC; any remainder stays as cash until the
          agent re-invests.
        </p>

        {status === "signing" && (
          <p className="text-xs text-gold-deep">Sign the withdrawal in your wallet…</p>
        )}
        {status === "confirming" && (
          <p className="text-xs text-gold-deep">Confirming on-chain (~8s)…</p>
        )}
        {status === "done" && txHash && (
          <p className="font-mono text-xs text-ink-faint">tx: {truncateHash(txHash)}</p>
        )}
        {error && <p className="text-xs text-terracotta">{error}</p>}
      </div>
    </section>
  );
}
