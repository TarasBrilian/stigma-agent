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

/** Public env (NEXT_PUBLIC_* only — no secrets ever in the frontend). */
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  network: process.env.NEXT_PUBLIC_CASPER_NETWORK ?? "casper-test",
  /** Public node RPC used only to submit user-signed deploys (reads go via backend). */
  nodeUrl: process.env.NEXT_PUBLIC_CASPER_NODE_URL ?? "",
  vaultFactoryHash: process.env.NEXT_PUBLIC_VAULT_FACTORY_HASH ?? "",
} as const;
