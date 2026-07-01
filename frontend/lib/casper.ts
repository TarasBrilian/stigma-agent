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

import type { Deploy, Transaction } from "casper-js-sdk";
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
/* Each builder returns an UNSIGNED Casper 2.0 `Transaction` (TransactionV1, by  */
/* package hash) — the SAME construction the live-verified backend uses for its  */
/* contract calls (`ContractCallBuilder` + `Args`/`CLValue`/`Key`). Sign with    */
/* `signTransactionWithWallet`, then submit `submitTransaction`. casper-js-sdk    */
/* values are dynamically imported inside each builder so the SDK stays out of   */
/* the initial client bundle (only type-only imports live at module scope).      */

/**
 * Gas ceilings (motes) for the two user actions. `approve` is a single CEP-18
 * allowance write; `deposit` runs a cross-contract `transfer_from` + event, so it
 * budgets more. Deliberately a little generous to avoid an out-of-gas revert in
 * the demo. (The backend uses ~10 CSPR for its single writes.)
 */
const APPROVE_GAS_MOTES = 5_000_000_000; // 5 CSPR
const DEPOSIT_GAS_MOTES = 15_000_000_000; // 15 CSPR

/** Strip a `hash-`/`contract-package-`/`contract-` prefix → bare package-hash hex. */
function packageHashHex(hash: string): string {
  return hash.replace(/^(hash-|contract-package-|contract-)/, "");
}

/**
 * Validate a raw USD amount (6 dp integer string) before it becomes a `U256`.
 * Input validation only — NOT money math: no arithmetic decides a value, the
 * string is passed through untouched. Rejects empty / non-positive / decimal / hex.
 */
function assertRawUsd(amount: Usd6, label: string): void {
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error(
      `${label}: expected a positive raw USD amount (integer string, 6 dp), got "${amount}"`,
    );
  }
}

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
  // TODO (ADR 0001): build a MODULE-BYTES (session WASM) deploy of Vault.wasm —
  // there is no VaultFactory. Pass Vault::init args as CLValues: owner =
  // _publicKeyHex, agent = env.agentPublicKey, profile, base_allocation,
  // target_amount_usd, target_year, oracle = env.oracleHash, router =
  // env.routerHash, assets = [env.tokenHashes.mUSDC, …all 5]. The backend (not
  // the UI) calls VaultRegistry.register after the deploy is reported.
  throw new Error("buildCreateVaultDeploy: not implemented yet");
}

/**
 * CEP-18 `approve`: authorize the vault to pull `amount` mUSDC from the owner —
 * the REQUIRED first leg of a deposit, because `Vault.deposit` runs
 * `transfer_from(owner → vault)` and so needs an allowance first (see the
 * contract test: approve → deposit). Targets the mUSDC token; `spender` is the
 * vault as a `Key::Hash` (the identity a CEP-18 token keys allowances by).
 * 🔴 golden rule #1: a USER action (owner-signed) — never an agent action.
 */
export async function buildApproveDeploy(
  publicKeyHex: string,
  vaultHash: string,
  amount: Usd6,
): Promise<Transaction> {
  assertRawUsd(amount, "buildApproveDeploy");
  if (!vaultHash) throw new Error("buildApproveDeploy: vaultHash is required.");
  const musdc = env.tokenHashes.mUSDC;
  if (!musdc) throw new Error("NEXT_PUBLIC_TOKEN_MUSDC_HASH is not set.");

  const { Args, CLValue, ContractCallBuilder, Key, PublicKey } = await import(
    "casper-js-sdk"
  );
  const args = Args.fromMap({
    spender: CLValue.newCLKey(Key.newKey(`hash-${packageHashHex(vaultHash)}`)),
    amount: CLValue.newCLUInt256(amount),
  });
  return new ContractCallBuilder()
    .from(PublicKey.fromHex(publicKeyHex))
    .byPackageHash(packageHashHex(musdc))
    .entryPoint("approve")
    .runtimeArgs(args)
    .chainName(env.network)
    .payment(APPROVE_GAS_MOTES)
    .build();
}

/**
 * `Vault.deposit(amount)`: escrow `amount` mUSDC into the vault. The owner MUST
 * have `approve`d the vault first — build + sign `buildApproveDeploy` and land it
 * before this (or check the allowance). After the deposit confirms (~8s), the
 * backend keeper observes the idle mUSDC and triggers `execute_buy`; the UI just
 * refreshes via backend reads.
 * 🔴 golden rule #1: a USER action (owner-only on-chain) — never an agent action.
 */
export async function buildDepositDeploy(
  publicKeyHex: string,
  vaultHash: string,
  amount: Usd6,
): Promise<Transaction> {
  assertRawUsd(amount, "buildDepositDeploy");
  if (!vaultHash) throw new Error("buildDepositDeploy: vaultHash is required.");

  const { Args, CLValue, ContractCallBuilder, PublicKey } = await import(
    "casper-js-sdk"
  );
  const args = Args.fromMap({ amount: CLValue.newCLUInt256(amount) });
  return new ContractCallBuilder()
    .from(PublicKey.fromHex(publicKeyHex))
    .byPackageHash(packageHashHex(vaultHash))
    .entryPoint("deposit")
    .runtimeArgs(args)
    .chainName(env.network)
    .payment(DEPOSIT_GAS_MOTES)
    .build();
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
/* The builders above produce an UNSIGNED Casper 2.0 `Transaction` (TransactionV1). */
/* `signTransactionWithWallet` asks the Casper Wallet to sign it and attaches the   */
/* returned signature as an approval; `submitTransaction` puts it on-chain via       */
/* `putTransaction`. This mirrors the backend's proven write path (`tx.sign(key)` →  */
/* `putTransaction`) — the only difference is the signer is the user's wallet, not   */
/* a local key, so we attach the signature by hand instead of calling `tx.sign`.     */

/**
 * Normalize a wallet signature into the bytes a Casper approval expects: a 1-byte
 * algorithm tag (`0x01` ed25519 / `0x02` secp256k1) followed by the 64-byte raw
 * signature. The Casper Wallet returns the raw 64-byte signature WITHOUT the tag,
 * so we prepend it — the tag equals the signer public key's own prefix byte. A
 * wallet that already tagged it (65 bytes) is passed through unchanged.
 */
function toApprovalSignature(raw: Uint8Array, publicKeyHex: string): Uint8Array {
  const algTag = Number.parseInt(publicKeyHex.slice(0, 2), 16); // pubkey prefix == sig algorithm tag
  if (algTag !== 1 && algTag !== 2) {
    throw new Error(
      `Unsupported public-key algorithm prefix "0x${publicKeyHex.slice(0, 2)}".`,
    );
  }
  if (raw.length === 65) return raw; // already tagged by the wallet
  if (raw.length === 64) {
    const tagged = new Uint8Array(65);
    tagged[0] = algTag;
    tagged.set(raw, 1);
    return tagged;
  }
  throw new Error(
    `Unexpected wallet signature length ${raw.length} (expected 64 or 65 bytes).`,
  );
}

/**
 * Ask the Casper Wallet to sign `tx` and attach the signature as an approval,
 * returning the now-signed transaction ready for `submitTransaction`. The wallet
 * signs the SDK's canonical transaction JSON (`Transaction.toJSON()`); `publicKeyHex`
 * must be the connected active key.
 * 🔴 golden rule #1: only USER-action transactions reach here — never an agent action.
 */
export async function signTransactionWithWallet(
  tx: Transaction,
  publicKeyHex: string,
): Promise<Transaction> {
  const provider = getWalletProvider();
  const payloadJson = JSON.stringify(tx.toJSON());
  const res = await provider.sign(payloadJson, publicKeyHex);
  if (res.cancelled) throw new Error("Signing was cancelled in the wallet.");

  const { Conversions, PublicKey } = await import("casper-js-sdk");
  // Prefer the hex string (survives the extension message boundary cleanly);
  // fall back to the raw bytes if that's all the wallet returned. Any malformed or
  // partial decode is rejected by the 64/65-byte invariant in `toApprovalSignature`.
  const raw = res.signatureHex
    ? Conversions.decodeBase16(res.signatureHex.replace(/^0x/, ""))
    : res.signature;
  if (!raw || raw.length === 0) throw new Error("Wallet returned no signature.");

  tx.setSignature(
    toApprovalSignature(raw, publicKeyHex),
    PublicKey.fromHex(publicKeyHex),
  );
  return tx;
}

/**
 * Lazily build an `RpcClient` against the public node. Dynamic import keeps
 * casper-js-sdk out of the initial client bundle (only needed at submit time).
 */
async function rpcClient() {
  if (!env.nodeUrl) throw new Error("NEXT_PUBLIC_CASPER_NODE_URL is not set.");
  const { HttpHandler, RpcClient } = await import("casper-js-sdk");
  return new RpcClient(new HttpHandler(env.nodeUrl));
}

/** Submit a signed transaction to the network; returns the transaction hash (hex). */
export async function submitTransaction(tx: Transaction): Promise<string> {
  const rpc = await rpcClient();
  const result = await rpc.putTransaction(tx);
  return result.transactionHash.toHex();
}

/**
 * Wait for a submitted transaction to finalize, surfacing an on-chain revert as a
 * thrown error (mirrors the backend's proven write path). Needed to land `approve`
 * before `deposit`: `Vault.deposit` runs `transfer_from`, which requires the
 * allowance already finalized — submitting both back-to-back risks the deposit
 * executing first (Casper gives no submission-order guarantee) and reverting.
 */
export async function confirmTransaction(
  tx: Transaction,
  timeoutMs = 90_000,
): Promise<void> {
  const rpc = await rpcClient();
  const info = await rpc.waitForTransaction(tx, timeoutMs);
  const revert = info?.executionInfo?.executionResult?.errorMessage;
  if (revert) throw new Error(`Transaction reverted on-chain: ${revert}`);
}
