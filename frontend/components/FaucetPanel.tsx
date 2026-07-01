"use client";

/**
 * Testnet faucet: mint test mUSDC to the connected wallet with a single
 * owner-signed `faucet_mint`. Only mUSDC is faucet-mintable on-chain (asset
 * tokens revert with FaucetDisabled); the user deposits the mUSDC into a vault
 * and the agent buys the rest.
 *
 * 🔴 golden rules: signs a USER action only (self-mint — never execute_buy /
 * rebalance / set_price); no money math — the claim size is a fixed constant.
 */

import { buildFaucetMintDeploy, FAUCET_MUSDC_RAW } from "@/lib/casper";
import { formatUsd } from "@/lib/format";
import { TxLink } from "@/components/TxLink";
import { useSignedAction } from "@/hooks/use-signed-action";
import { useWallet } from "@/hooks/use-wallet";

const CLAIM_LABEL = `${formatUsd(FAUCET_MUSDC_RAW)} mUSDC`;

export function FaucetPanel() {
  const { isConnected, isConnecting, connect } = useWallet();
  const { run, busy, status, txHash, error } = useSignedAction();

  const claim = () =>
    void run((pk) => buildFaucetMintDeploy(pk, FAUCET_MUSDC_RAW));

  return (
    <section className="relief-panel mx-auto flex max-w-xl flex-col gap-4 p-6">
      <div>
        <h1 className="carved-title text-xl">Faucet</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Claim {CLAIM_LABEL} to your connected wallet, then deposit it into a
          vault — the agent buys the other assets on your behalf. Only mUSDC is
          faucet-mintable; the asset tokens (BTC, gold, NVDAx, GOOGLx) are minted
          by the vault when you deposit.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">Connect your wallet to claim.</p>
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="btn-gold self-start px-4 py-2 text-sm"
          >
            {isConnecting ? "Connecting…" : "Connect wallet"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={claim}
            disabled={busy}
            className="btn-gold self-start px-4 py-2 text-sm"
          >
            {busy ? "Claiming…" : `Claim ${CLAIM_LABEL}`}
          </button>

          {status === "signing" && (
            <p className="text-xs text-gold-deep">
              Confirm the mint in your wallet…
            </p>
          )}
          {status === "confirming" && (
            <p className="text-xs text-gold-deep">Minting on-chain (~8s)…</p>
          )}
          {status === "done" && txHash && (
            <p className="text-xs text-ink-faint">
              Minted {CLAIM_LABEL} ✓ <TxLink hash={txHash} />
            </p>
          )}
          {error && <p className="text-xs text-terracotta">{error}</p>}
        </div>
      )}
    </section>
  );
}
