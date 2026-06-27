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

/**
 * Assumed CEP-18 token decimals for the mock assets, used to convert raw token
 * holdings × oracle price into USD (6 dp). Confirm against `../contract` once the
 * tokens are deployed — a mismatch would distort DISPLAYED value (never an
 * executed amount; those are derived in-contract).
 */
export const TOKEN_DECIMALS = 6;

/** Short human blurb per profile (display + starter rationale). */
export const PROFILE_BLURB: Record<Profile, string> = {
  Conservative:
    'Capital preservation first; gold + stablecoin heavy, de-risks early.',
  Moderate:
    'Balanced growth with a glide toward gold + stablecoin near the goal.',
  Aggressive:
    'Growth-tilted (BTC/equities) early, still de-risking toward the goal.',
};

/**
 * Suggested growth-tilted START allocation per profile (bps, Σ = 10000) — the
 * `base_allocation` we PROPOSE at vault creation. This is a suggestion: it is
 * user-editable and the contract is authoritative (it re-validates Σ == 10000
 * and asset membership). The glide-adjusted CURRENT target is computed on-chain
 * and read via `chain.viewState` — never derived from this. Mirrors the "Start"
 * column in `../contract/ARCHITECTURE.md` §5.
 */
export const STARTER_ALLOCATION_BPS: Record<Profile, Record<string, number>> = {
  Conservative: {
    mXAUT: 4000,
    mUSDC: 3000,
    mBTC: 1000,
    mNVDAx: 1000,
    mGOOGLx: 1000,
  },
  Moderate: { mBTC: 2000, mNVDAx: 3000, mXAUT: 4000, mGOOGLx: 1000 },
  Aggressive: { mBTC: 4000, mNVDAx: 3500, mGOOGLx: 1500, mXAUT: 1000 },
};

/** Horizons (years from now) used to generate a few starter portfolios. */
export const STARTER_HORIZONS_YEARS = [5, 10, 20];

/** Default goal amount for generated starters (raw USD, 6 dp) = $100,000. */
export const STARTER_DEFAULT_TARGET_USD6 = '100000000000';
