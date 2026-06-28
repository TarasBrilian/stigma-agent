/**
 * Static metadata + environment accessors.
 *
 * Asset list and profile enum MUST match `../contract` and `../backend`.
 * Contract hashes come from env (sourced from `../contract` deploys) — never
 * hardcode them (golden rule: hashes change on redeploy).
 */

import type { AssetSymbol, Profile } from "./types";

/** Asset display metadata. `color` drives the allocation charts. */
export const ASSETS: Record<
  AssetSymbol,
  { label: string; description: string; color: string }
> = {
  mUSDC: { label: "mUSDC", description: "Mock USD stablecoin (base)", color: "#2775CA" },
  mBTC: { label: "BTC", description: "Mock Bitcoin", color: "#F7931A" },
  mNVDAx: { label: "NVDAx", description: "Mock tokenized NVIDIA", color: "#76B900" },
  mXAUT: { label: "Gold", description: "Mock tokenized gold", color: "#D4AF37" },
  mGOOGLx: { label: "GOOGLx", description: "Mock tokenized Google", color: "#4285F4" },
};

export const ASSET_SYMBOLS = Object.keys(ASSETS) as AssetSymbol[];

export const PROFILES: Profile[] = ["Conservative", "Moderate", "Aggressive"];

export const PROFILE_BLURB: Record<Profile, string> = {
  Conservative: "Capital preservation first; gold + stablecoin heavy, de-risks early.",
  Moderate: "Balanced growth with a glide toward gold + stablecoin near the goal.",
  Aggressive: "Growth-tilted (BTC/equities) early, still de-risking toward the goal.",
};

export const BPS_TOTAL = 10_000;

/**
 * Public env (NEXT_PUBLIC_* only — no secrets ever in the frontend).
 *
 * Hashes are PUBLIC testnet package hashes sourced from
 * `../contract/deployed.casper-test.json`. The UI needs them because, per
 * ADR 0001 (`../../docs/decisions/0001-vault-creation-path.md`), the *user* signs
 * the `Vault.wasm` deploy and so the client supplies every `Vault::init` arg
 * (agent, oracle, router, assets[5]). There is deliberately **no** registry hash
 * here — the backend (not the UI) calls `VaultRegistry.register`, and all reads
 * go through the backend.
 *
 * NOTE: each `process.env.NEXT_PUBLIC_*` must be referenced as a static literal
 * so Next.js can inline it at build time — do not index `process.env` dynamically.
 */
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  network: process.env.NEXT_PUBLIC_CASPER_NETWORK ?? "casper-test",
  /** Public node RPC used only to submit user-signed deploys (reads go via backend). */
  nodeUrl: process.env.NEXT_PUBLIC_CASPER_NODE_URL ?? "",
  /** Shared agent key, passed as the `agent` init arg when a user creates a vault. */
  agentPublicKey: process.env.NEXT_PUBLIC_AGENT_PUBLIC_KEY ?? "",
  /** Oracle + router package hashes — `Vault::init` args. */
  oracleHash: process.env.NEXT_PUBLIC_ORACLE_HASH ?? "",
  routerHash: process.env.NEXT_PUBLIC_ROUTER_HASH ?? "",
  /**
   * Per-asset token package hashes in canonical order (`assets[5]` init arg).
   * `mUSDC` also backs the deposit `approve`.
   */
  tokenHashes: {
    mUSDC: process.env.NEXT_PUBLIC_TOKEN_MUSDC_HASH ?? "",
    mBTC: process.env.NEXT_PUBLIC_TOKEN_MBTC_HASH ?? "",
    mNVDAx: process.env.NEXT_PUBLIC_TOKEN_MNVDAX_HASH ?? "",
    mXAUT: process.env.NEXT_PUBLIC_TOKEN_MXAUT_HASH ?? "",
    mGOOGLx: process.env.NEXT_PUBLIC_TOKEN_MGOOGLX_HASH ?? "",
  } as Record<AssetSymbol, string>,
} as const;
