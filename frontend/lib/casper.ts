/**
 * Wallet connection + USER-action deploy signing/submission.
 *
 * 🔴 GOLDEN RULE (see CLAUDE.md): the frontend signs USER actions ONLY —
 * `create_vault`, `deposit`, `withdraw`, `update_config`. It must NEVER build or
 * submit agent actions (`execute_buy`, `rebalance`, `set_price`); those are
 * backend-only with the agent key. Do not add a builder for them here.
 *
 * Wallet: the Casper Wallet browser extension injects `window.CasperWalletProvider`
 * (no npm package — see lib/casper-wallet.d.ts). Chain submission uses
 * casper-js-sdk v5 (`RpcClient` + `HttpHandler`). Reads of portfolio state go
 * through the BACKEND (lib/api.ts), not directly from here.
 *
 * This module is CLIENT-ONLY (touches `window`). Never import it into a Server
 * Component.
 */

import type { Deploy } from "casper-js-sdk";
import { env } from "./constants";
import type { CasperWalletProviderInstance } from "./casper-wallet";
import type { Allocation, Profile, Usd6 } from "./types";

const WALLET_TIMEOUT_MS = 30_000;

/** Get the injected wallet provider, or throw a friendly error if absent. */
export function getWalletProvider(): CasperWalletProviderInstance {
  if (typeof window === "undefined" || !window.CasperWalletProvider) {
    throw new Error(
      "Casper Wallet not found. Install the Casper Wallet browser extension.",
    );
  }
  return window.CasperWalletProvider({ timeout: WALLET_TIMEOUT_MS });
}

/* ----------------------------- wallet session ----------------------------- */

export async function connectWallet(): Promise<string> {
  const provider = getWalletProvider();
  const connected = await provider.requestConnection();
  if (!connected) throw new Error("Wallet connection was rejected.");
  return provider.getActivePublicKey();
}

export async function getActivePublicKey(): Promise<string | null> {
  const provider = getWalletProvider();
  if (!(await provider.isConnected())) return null;
  return provider.getActivePublicKey();
}

export async function disconnectWallet(): Promise<void> {
  await getWalletProvider().disconnectFromSite();
}

/**
 * Subscribe to wallet events (connected / disconnected / active key changed …).
 * Returns an unsubscribe function. No-op during SSR.
 */
export function subscribeWalletEvents(handler: () => void): () => void {
  if (typeof window === "undefined" || !window.CasperWalletEventTypes) {
    return () => {};
  }
  const types = Object.values(window.CasperWalletEventTypes);
  types.forEach((t) => window.addEventListener(t, handler));
  return () => types.forEach((t) => window.removeEventListener(t, handler));
}

/* --------------------------- user-action deploys -------------------------- */
/* Each builder returns an UNSIGNED Deploy. Sign with `signDeployWithWallet`,   */
/* then submit with `submitDeploy`. Building is stubbed until contract entry    */
/* points + CLValue args are wired against the deployed hashes.                 */

export interface CreateVaultArgs {
  profile: Profile;
  baseAllocation: Allocation; // Σ must equal 10000 (validated on-chain)
  targetAmountUsd: Usd6;
  targetYear: number;
}

export function buildCreateVaultDeploy(
  _publicKeyHex: string,
  _args: CreateVaultArgs,
): Deploy {
  // TODO: build a session deploy calling VaultFactory.create_vault with CLValue
  // args (profile, base_allocation map, target_amount_usd, target_year) against
  // env.vaultFactoryHash on env.network.
  throw new Error("buildCreateVaultDeploy: not implemented yet");
}

export function buildDepositDeploy(
  _publicKeyHex: string,
  _vaultHash: string,
  _amount: Usd6,
): Deploy {
  // TODO: call Vault.deposit(amount) — escrows mUSDC. owner-only on-chain.
  throw new Error("buildDepositDeploy: not implemented yet");
}

export function buildWithdrawDeploy(
  _publicKeyHex: string,
  _vaultHash: string,
  _amountOrAll: Usd6 | "all",
): Deploy {
  // TODO: call Vault.withdraw(amount_or_all) — owner-only; sells to mUSDC.
  throw new Error("buildWithdrawDeploy: not implemented yet");
}

export function buildUpdateConfigDeploy(
  _publicKeyHex: string,
  _vaultHash: string,
  _patch: { allocation?: Allocation; targetAmountUsd?: Usd6; targetYear?: number },
): Deploy {
  // TODO: call Vault.update_config(...) — owner-only; re-validates Σ == 10000.
  throw new Error("buildUpdateConfigDeploy: not implemented yet");
}

/* ----------------------------- sign & submit ------------------------------ */

/**
 * Ask the wallet to sign a deploy and attach the signature.
 * TODO: serialize `deploy` to the JSON shape the wallet expects, then apply the
 * returned signature approval back onto the Deploy (casper-js-sdk v5).
 */
export async function signDeployWithWallet(
  deploy: Deploy,
  publicKeyHex: string,
): Promise<Deploy> {
  const provider = getWalletProvider();
  const payloadJson = JSON.stringify(deploy); // TODO: use the SDK's canonical JSON
  const res = await provider.sign(payloadJson, publicKeyHex);
  if (res.cancelled) throw new Error("Signing was cancelled.");
  // TODO: attach res.signature/res.signatureHex as an Approval on the deploy.
  return deploy;
}

/** Submit a signed deploy to the network; returns the deploy hash. */
export async function submitDeploy(deploy: Deploy): Promise<string> {
  if (!env.nodeUrl) throw new Error("NEXT_PUBLIC_CASPER_NODE_URL is not set.");
  // Dynamic import keeps casper-js-sdk out of the initial client bundle; it is
  // only needed at submit time.
  const { HttpHandler, RpcClient } = await import("casper-js-sdk");
  const rpc = new RpcClient(new HttpHandler(env.nodeUrl));
  const result = await rpc.putDeploy(deploy);
  return result.deployHash.toHex();
}
