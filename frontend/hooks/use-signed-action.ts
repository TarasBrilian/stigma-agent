"use client";

/**
 * Shared orchestration for a SINGLE owner-signed vault action: sign → submit →
 * confirm finalization → refresh the server-rendered reads, with a small status
 * machine + error/tx-hash state. Withdraw and update-config are one-signature
 * actions and use this directly.
 *
 * Multi-step flows keep bespoke logic on purpose: the deposit flow is two signed
 * transactions (approve then deposit) and create-vault also resolves the new
 * address + registers it — neither fits a single `run(build)`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "casper-js-sdk";
import {
  confirmTransaction,
  signTransactionWithWallet,
  submitTransaction,
} from "@/lib/casper";
import { useWallet } from "@/hooks/use-wallet";

export type SignedActionStatus =
  | "idle"
  | "signing"
  | "confirming"
  | "done"
  | "error";

export function useSignedAction() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [status, setStatus] = useState<SignedActionStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = status === "signing" || status === "confirming";

  /**
   * Run one signed action: `build` produces the unsigned transaction for the
   * connected key. Returns true on success. Refreshes server reads (~1 block) when
   * the transaction finalizes.
   */
  const run = async (
    build: (publicKeyHex: string) => Promise<Transaction>,
  ): Promise<boolean> => {
    if (!publicKey) {
      setError("Connect your wallet first.");
      return false;
    }
    setError(null);
    setTxHash(null);
    try {
      setStatus("signing");
      const signed = await signTransactionWithWallet(await build(publicKey), publicKey);
      const hash = await submitTransaction(signed);

      setStatus("confirming");
      await confirmTransaction(signed);

      setTxHash(hash);
      setStatus("done");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
      setStatus("error");
      return false;
    }
  };

  return { status, txHash, error, busy, publicKey, run, setError };
}
