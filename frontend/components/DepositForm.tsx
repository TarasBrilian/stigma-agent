"use client";

/**
 * Real USER deposit into a vault: sign `approve` (CEP-18 allowance) then `deposit`
 * (escrow mUSDC) — two owner-signed transactions. Visually distinct from the
 * testnet DemoPanel because this moves (testnet) funds on the user's signature.
 *
 * After the deposit finalizes, AgentInvestOverlay triggers the keeper's buy
 * (executeBuy) and animates the agent investing across the glide-path target — so
 * the AI's work is visible instead of a silent background poll.
 *
 * 🔴 golden rules: only USER actions are signed here (never execute_buy / rebalance /
 * set_price — the invest is triggered via the backend keeper endpoint, not signed
 * here); the sole numeric work is ENCODING the typed dollar amount via
 * `parseUsdToRaw` (lib/format) — no money math decides a value.
 *
 * The deposit runs `transfer_from`, so the allowance must be finalized first — we
 * `confirmTransaction` the approve before signing the deposit (Casper gives no
 * submission-order guarantee, so a back-to-back deposit could revert).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildApproveDeploy,
  buildDepositDeploy,
  confirmTransaction,
  signTransactionWithWallet,
  submitTransaction,
} from "@/lib/casper";
import { parseUsdToRaw } from "@/lib/format";
import { TxLink } from "@/components/TxLink";
import { AgentInvestOverlay } from "@/components/AgentInvestOverlay";
import { useWallet } from "@/hooks/use-wallet";

type Status =
  | "idle"
  | "approving"
  | "confirming"
  | "depositing"
  | "finalizing"
  | "pending"
  | "error";

const STATUS_LABEL: Record<
  Exclude<Status, "idle" | "error" | "pending">,
  string
> = {
  approving: "Step 1 of 2 — approve mUSDC in your wallet…",
  confirming: "Waiting for the approval to finalize (~8s)…",
  depositing: "Step 2 of 2 — confirm the deposit in your wallet…",
  finalizing: "Finalizing your deposit (~8s)…",
};

export function DepositForm({ vaultHash }: { vaultHash: string }) {
  const { publicKey, isConnected, isConnecting, connect } = useWallet();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [investAmount, setInvestAmount] = useState<string | null>(null);

  const busy =
    status === "approving" ||
    status === "confirming" ||
    status === "depositing" ||
    status === "finalizing";

  const handleDeposit = async () => {
    if (!publicKey) {
      setError("Connect your wallet first.");
      return;
    }
    let raw: string;
    try {
      raw = parseUsdToRaw(amount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid amount.");
      return;
    }

    setError(null);
    setTxHash(null);
    try {
      // 1/2 approve — authorize the vault to pull `raw` mUSDC from the owner.
      setStatus("approving");
      const approveTx = await signTransactionWithWallet(
        await buildApproveDeploy(publicKey, vaultHash, raw),
        publicKey,
      );
      await submitTransaction(approveTx);

      // Land the allowance before depositing (deposit runs transfer_from).
      setStatus("confirming");
      await confirmTransaction(approveTx);

      // 2/2 deposit — escrow the mUSDC into the vault.
      setStatus("depositing");
      const depositTx = await signTransactionWithWallet(
        await buildDepositDeploy(publicKey, vaultHash, raw),
        publicKey,
      );
      const hash = await submitTransaction(depositTx);
      setTxHash(hash);

      // Land the deposit so the vault's idle mUSDC is readable, then hand off to
      // the agent-investing overlay (it triggers executeBuy and reveals the result).
      setStatus("finalizing");
      await confirmTransaction(depositTx);
      setAmount("");
      setStatus("pending");
      setInvestAmount(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed.");
      setStatus("error");
    }
  };

  return (
    <>
      <section className="relief-panel p-5">
        <h2 className="section-title mb-4">Deposit</h2>

        {!isConnected ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft">
              Connect your wallet to fund this vault with test mUSDC.
            </p>
            <button
              onClick={() => void connect()}
              disabled={isConnecting}
              className="btn-gold px-4 py-2 text-sm"
            >
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !busy && void handleDeposit()
                }
                placeholder="100.00"
                disabled={busy}
                className="field flex-1 px-3 py-2 text-sm"
              />
              <button
                onClick={() => void handleDeposit()}
                disabled={busy || amount.trim() === ""}
                className="btn-gold px-4 py-2 text-sm"
              >
                {busy ? "Working…" : "Deposit"}
              </button>
            </div>
            <p className="text-xs text-ink-faint">
              Two signatures: approve, then deposit. mUSDC only.
            </p>

            {status !== "idle" && status !== "error" && status !== "pending" && (
              <p className="text-xs text-gold-deep">{STATUS_LABEL[status]}</p>
            )}
            {txHash && (
              <p className="text-xs text-ink-faint">
                <TxLink hash={txHash} />
              </p>
            )}
            {error && <p className="text-xs text-terracotta">{error}</p>}
          </div>
        )}
      </section>

      {investAmount && (
        <AgentInvestOverlay
          vaultHash={vaultHash}
          amountUsd6={investAmount}
          onDone={() => {
            setInvestAmount(null);
            setStatus("idle");
            setTxHash(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
