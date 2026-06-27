/**
 * Shared domain types for the Stigma Agent frontend.
 *
 * IMPORTANT (see CLAUDE.md golden rules):
 * - The frontend is DISPLAY-ONLY for money. These types model what the backend
 *   returns; the UI never computes any of these values.
 * - USD amounts are fixed-point integers with 6 decimals, transported as STRINGS
 *   to avoid `number` precision loss. Format them via `lib/format.ts`.
 * - Weights are basis points (bps), integers, Σ = 10000. bps fit safely in
 *   `number`, so they are typed as `number`.
 */

/** Risk profile buckets (must match the contract enum + backend). */
export type Profile = "Conservative" | "Moderate" | "Aggressive";

/** Tradable mock assets on testnet (must match `../contract`). */
export type AssetSymbol = "mUSDC" | "mBTC" | "mNVDAx" | "mXAUT" | "mGOOGLx";

/** Allocation weights in basis points keyed by asset. Σ should equal 10000. */
export type Allocation = Partial<Record<AssetSymbol, number>>;

/** Raw fixed-point USD value (6 dp) as a string, e.g. "1234560000" = $1,234.56. */
export type Usd6 = string;

/** Result of LLM risk profiling (the LLM returns a bucket + reasoning only). */
export interface ProfileResult {
  profile: Profile;
  reasoning: string;
  /** Optional internal score that drove the bucket selection. */
  score?: number;
}

/** A suggested starter portfolio for a profile (allocation is user-editable). */
export interface StarterPortfolio {
  name: string;
  profile: Profile;
  allocation: Allocation;
  targetAmountUsd: Usd6;
  targetYear: number;
  rationale?: string;
}

/** AI-suggested allocation for a custom goal (user-editable before it executes). */
export interface SuggestAllocationResult {
  allocation: Allocation;
  rationale: string;
}

/** Off-chain mirror of a vault's metadata (fast UI; not the source of truth). */
export interface PortfolioMeta {
  vaultHash: string;
  owner: string;
  name: string;
  profile: Profile;
  /** The growth-tilted start point chosen at creation. */
  baseAllocation: Allocation;
  targetAmountUsd: Usd6;
  targetYear: number;
  createdYear: number;
  createdAt: string;
}

/**
 * Merged portfolio view the backend relays to the UI: off-chain meta + live
 * on-chain state. `currentTargetAllocation` is the contract's glide-adjusted
 * target read via `view_state` — the UI must NOT re-derive it.
 */
export interface PortfolioState extends PortfolioMeta {
  /** Per-asset raw token balances held by the vault. */
  holdings: Partial<Record<AssetSymbol, string>>;
  /** Current weights from holdings × oracle prices (computed by backend), bps. */
  currentAllocation: Allocation;
  /** Glide-path-adjusted target from the contract (`view_state`), bps. */
  currentTargetAllocation: Allocation;
  /** Total portfolio value in USD (6 dp). */
  totalValueUsd: Usd6;
}

/** Dashboard list item. */
export interface PortfolioSummary {
  meta: PortfolioMeta;
  totalValueUsd: Usd6;
  /** Progress toward the goal in bps (value / targetAmount), capped at 10000. */
  progressBps: number;
}

/**
 * Live contribution projection. Recomputed by the backend on every request from
 * the *current* actual value, so the on-track indicator self-corrects.
 */
export interface Projection {
  /** Required monthly contribution in USD (6 dp). <= 0 means ahead of target. */
  requiredMonthlyUsd: Usd6;
  onTrack: boolean;
  /** The annual return assumption used, surfaced as an explicit assumption (bps). */
  returnAssumptionBps: number;
  yearsLeft: number;
  presentValueUsd: Usd6;
  futureValueUsd: Usd6;
}

/** One leg of a rebalance (sell or buy). */
export interface SwapLeg {
  asset: AssetSymbol;
  /** Signed delta in USD (6 dp): negative = sold, positive = bought. */
  deltaUsd: Usd6;
}

/** A persisted rebalance event with the agent's natural-language rationale. */
export interface RebalanceLogEntry {
  id: string;
  vaultHash: string;
  timestamp: string;
  preWeights: Allocation;
  postWeights: Allocation;
  swaps: SwapLeg[];
  /** The agent's explanation — surfaced inline in the UI, not buried. */
  rationale: string;
  /** x402 micro-fee receipt id, if charged. */
  x402Receipt?: string;
}

/** Agent Q&A message. */
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
}

/** One onboarding answer (raw). */
export interface OnboardingAnswer {
  questionId: string;
  value: string | number;
}

/** Payload submitted at the end of onboarding. */
export interface OnboardingSubmission {
  owner: string;
  answers: OnboardingAnswer[];
  demographics: Record<string, string | number>;
}

/** Response to onboarding: assigned profile + generated starter portfolios. */
export interface OnboardingResult {
  profile: ProfileResult;
  starters: StarterPortfolio[];
}
