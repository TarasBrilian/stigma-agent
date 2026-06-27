/**
 * The single home for backend-owned numeric policy (CLAUDE.md golden rule #6:
 * keep bands + return assumptions in ONE config file, not scattered).
 *
 * The backend owns the rebalance DECISION (drift band) and the PROJECTION
 * (return assumption). It does NOT own the glide target — that is computed
 * on-chain and read via `chain.viewState`.
 *
 * Units: USD as fixed-point 6 dp; weights as bps (Σ = 10000). Never floats for
 * value math.
 */

export type Profile = 'Conservative' | 'Moderate' | 'Aggressive';

export const PROFILES: Profile[] = ['Conservative', 'Moderate', 'Aggressive'];

/** Tradable mock assets — must match `../contract` and the frontend. */
export const ASSET_SYMBOLS = [
  'mUSDC',
  'mBTC',
  'mNVDAx',
  'mXAUT',
  'mGOOGLx',
] as const;
export type AssetSymbol = (typeof ASSET_SYMBOLS)[number];

export const BPS_TOTAL = 10_000;

/** Rebalance drift band per profile (bps). Owned here, not on-chain. */
export const DRIFT_BAND_BPS: Record<Profile, number> = {
  Conservative: 300, // ±3%
  Moderate: 500, // ±5%
  Aggressive: 800, // ±8%
};

/** Annual return assumption per profile (bps). Surfaced as an assumption only. */
export const ANNUAL_RETURN_BPS: Record<Profile, number> = {
  Conservative: 600, // 6%
  Moderate: 1200, // 12%
  Aggressive: 2000, // 20%
};

/** Keeper guards (golden rule #6: keep these — they prevent thrashing). */
export const KEEPER = {
  /** Don't rebalance a vault more than once per this window. */
  minRebalanceIntervalMs: 24 * 60 * 60 * 1000,
  /** Skip trades smaller than this (raw USD, 6 dp) to avoid dust churn. */
  minTradeUsd6: 1_000_000n, // $1.00
};

/** x402 micro-fee on rebalance only (bps of portfolio value). */
export const X402_FEE_BPS = 10; // 0.1%
