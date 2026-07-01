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
import { ASSET_SYMBOLS, env } from "./constants";
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
// Installing Vault.wasm as module bytes is a heavy session deploy — budget like the
// contract's own deploy runner (default 600 CSPR) to avoid an out-of-gas revert.
const CREATE_VAULT_GAS_MOTES = 600_000_000_000; // 600 CSPR

/** `#[odra::odra_type]` unit-enum tag for `Profile` (declaration order), encoded as U8. */
const PROFILE_TAG: Record<Profile, number> = {
  Conservative: 0,
  Moderate: 1,
  Aggressive: 2,
};

/** Strip a `hash-`/`contract-package-`/`contract-` prefix → bare package-hash hex. */
function packageHashHex(hash: string): string {
  return hash.replace(/^(hash-|contract-package-|contract-)/, "");
}

/**
 * Encode a contract/vault package hash as a `CLKey` (`Key::Hash`) — the identity a
 * CEP-18 token / an Odra `Address` uses for a contract. Async because the SDK is
 * dynamically imported (cached after first use). Shared by the approve + create-vault
 * builders so the encoding lives in ONE place.
 */
async function packageKeyCL(hash: string) {
  const { CLValue, Key } = await import("casper-js-sdk");
  return CLValue.newCLKey(Key.newKey(`hash-${packageHashHex(hash)}`));
}

/** Encode an account public-key hex as a `CLKey` (`Key::Account`) — an Odra `Address`. */
async function accountKeyCL(publicKeyHex: string) {
  const { CLValue, Key, PublicKey } = await import("casper-js-sdk");
  return CLValue.newCLKey(
    Key.newKey(PublicKey.fromHex(publicKeyHex).accountHash().toPrefixedString()),
  );
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

export interface BuiltVaultDeploy {
  transaction: Transaction;
  /**
   * The deployer-account named key under which the new vault's package hash lands.
   * Pass it to `resolveVaultHash` after the deploy finalizes to learn the address.
   */
  packageHashKeyName: string;
}

/** Fetch the compiled `Vault.wasm` (shipped as a public static asset) for the deploy. */
export async function fetchVaultWasm(): Promise<Uint8Array> {
  const res = await fetch("/Vault.wasm");
  if (!res.ok) throw new Error(`Failed to load Vault.wasm (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Build the user-signed MODULE-BYTES (session WASM) deploy that installs a `Vault`
 * with the caller as deployer + `owner` (ADR 0001 — there is no VaultFactory; each
 * vault is its own contract). The backend calls `VaultRegistry.register` afterward;
 * the UI does NOT sign register.
 *
 * The runtime args are the vault `init(...)` args PLUS Odra's install control args
 * (`odra_cfg_*`) that its WASM `call()` reads (Odra 2.8.2). Encodings: `Profile` is
 * a unit enum → a U8 tag; `Address`es are Casper `Key`s — accounts (owner/agent) as
 * `Key::Account`, contracts (oracle/router/assets) as `Key::Hash`; `base_allocation`
 * and `assets` are in the canonical asset order [mUSDC…mGOOGLx].
 * 🔴 golden rule #1 (USER action only) · #2 (allocation is validated on-chain; the UI
 * only orders/encodes the bps it was handed — it does not compute the target).
 */
export async function buildCreateVaultDeploy(
  publicKeyHex: string,
  args: CreateVaultArgs,
): Promise<BuiltVaultDeploy> {
  assertRawUsd(args.targetAmountUsd, "buildCreateVaultDeploy.targetAmountUsd");
  const { agentPublicKey, oracleHash, routerHash, tokenHashes } = env;
  if (!agentPublicKey) throw new Error("NEXT_PUBLIC_AGENT_PUBLIC_KEY is not set.");
  if (!oracleHash) throw new Error("NEXT_PUBLIC_ORACLE_HASH is not set.");
  if (!routerHash) throw new Error("NEXT_PUBLIC_ROUTER_HASH is not set.");
  const assetHashes = ASSET_SYMBOLS.map((s) => {
    const h = tokenHashes[s];
    if (!h) throw new Error(`Missing token hash for ${s} (NEXT_PUBLIC_TOKEN_*_HASH).`);
    return h;
  });

  const wasm = await fetchVaultWasm();
  const { Args, CLValue, CLTypeUInt32, CLTypeKey, PublicKey, SessionBuilder } =
    await import("casper-js-sdk");

  // Unique per deploy so a user can create several vaults without key-override.
  const packageHashKeyName = `stigma_vault_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const runtimeArgs = Args.fromMap({
    owner: await accountKeyCL(publicKeyHex),
    agent: await accountKeyCL(agentPublicKey),
    profile: CLValue.newCLUint8(PROFILE_TAG[args.profile]),
    base_allocation: CLValue.newCLList(
      CLTypeUInt32,
      ASSET_SYMBOLS.map((s) => CLValue.newCLUInt32(args.baseAllocation[s] ?? 0)),
    ),
    target_amount_usd: CLValue.newCLUInt256(args.targetAmountUsd),
    target_year: CLValue.newCLUInt32(args.targetYear),
    oracle: await packageKeyCL(oracleHash),
    router: await packageKeyCL(routerHash),
    assets: CLValue.newCLList(CLTypeKey, await Promise.all(assetHashes.map(packageKeyCL))),
    // Odra install control args read by the WASM `call()` (odra-core 2.8.2 consts).
    odra_cfg_package_hash_key_name: CLValue.newCLString(packageHashKeyName),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(false),
    odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
    odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
  });

  const transaction = new SessionBuilder()
    .from(PublicKey.fromHex(publicKeyHex))
    .wasm(wasm)
    .installOrUpgrade()
    .runtimeArgs(runtimeArgs)
    .chainName(env.network)
    .payment(CREATE_VAULT_GAS_MOTES)
    .build();

  return { transaction, packageHashKeyName };
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

  const { Args, CLValue, ContractCallBuilder, PublicKey } = await import(
    "casper-js-sdk"
  );
  const args = Args.fromMap({
    spender: await packageKeyCL(vaultHash),
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

/**
 * After a create-vault deploy finalizes, read the new vault's package hash from the
 * deployer's account named keys — Odra stores it under `packageHashKeyName`. Returns
 * the `hash-…` string to report to the backend's `register`. This is one-shot deploy
 * plumbing (learning the address the user just created), NOT a portfolio-value read —
 * those still go through the backend.
 */
export async function resolveVaultHash(
  publicKeyHex: string,
  packageHashKeyName: string,
): Promise<string> {
  const rpc = await rpcClient();
  const { EntityIdentifier, PublicKey } = await import("casper-js-sdk");
  const res = await rpc.getLatestEntity(
    EntityIdentifier.fromPublicKey(PublicKey.fromHex(publicKeyHex)),
  );
  // Casper 2.0 stores the deployer's named keys under the addressable entity;
  // pre-migration accounts still expose them under `legacyAccount`. Check both.
  const namedKeys =
    res.entity.addressableEntity?.namedKeys ??
    res.entity.legacyAccount?.namedKeys ??
    [];
  const named = namedKeys.find((k) => k.name === packageHashKeyName);
  if (!named) {
    throw new Error(
      `Vault deployed, but its address key "${packageHashKeyName}" is not on the account yet — retry the register in a moment.`,
    );
  }
  return named.key.toPrefixedString();
}
