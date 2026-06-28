/**
 * Off-chain mirror of the contract's glide-path math (`../../contract/src/constants.rs`).
 *
 * 🔴 WHY THIS EXISTS (and the golden-rule caveat): the contract is the source of
 * truth — `Vault.view_state()` computes `current_target` on-chain. CLAUDE.md
 * golden rule #5 says "don't re-implement the glide target; read it from
 * `view_state`". BUT Casper 2.0 / casper-js-sdk v5 has **no off-chain mechanism
 * to call an entry point and read its return value** (no `eth_call` equivalent;
 * `speculative_exec` returns write-effects only, and a read-only view writes
 * nothing). The computed target is therefore unreadable from stored state.
 *
 * The only way to surface the glide target off-chain is to recompute it from the
 * vault's STORED fields (base_allocation, profile, created_year, target_year),
 * which we read live via `chain`. To keep the rule's INTENT — one definition, no
 * drift — this file mirrors `constants.rs` line-for-line and is pinned to it by
 * `glide.spec.ts` (the exact Rust test vectors). If the contract glide changes,
 * these vectors fail. Integer-only, no floats — same as the contract.
 */
import { ASSET_SYMBOLS, BPS_TOTAL, type Profile } from '../config/constants';

/** De-risked END allocation (bps, Σ=10000) per profile, in canonical asset order
 *  `[mUSDC, mBTC, mNVDAx, mXAUT, mGOOGLx]`. Mirrors `end_allocation()`. */
export const END_ALLOCATION: Record<Profile, number[]> = {
  Conservative: [7000, 0, 0, 3000, 0], // mUSDC 70 · mXAUT 30
  Moderate: [5000, 0, 0, 5000, 0], //     mUSDC 50 · mXAUT 50
  Aggressive: [4000, 2000, 0, 4000, 0], // mUSDC 40 · mBTC 20 · mXAUT 40
};

/** Integer division truncated toward zero — matches Rust `i64 / i64` (NOT
 *  `Math.floor`, which rounds toward −∞ and would diverge on negative terms). */
function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/**
 * Glide target allocation (bps, Σ=10000): interpolates from `base` (growth-tilted
 * start) toward `end` (de-risked) as the goal approaches. Faithful port of
 * `glide_target()` in `constants.rs` — same clamping, same truncation, same
 * renormalize tie-break.
 */
export function glideTarget(
  base: number[],
  end: number[],
  createdYear: number,
  targetYear: number,
  currentYear: number,
): number[] {
  const n = base.length;
  const horizon = Math.max(0, targetYear - createdYear);
  let yearsLeft = Math.max(0, targetYear - currentYear);
  if (horizon > 0 && yearsLeft > horizon) yearsLeft = horizon;
  const f = horizon === 0 ? 0 : idiv(yearsLeft * BPS_TOTAL, horizon);

  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = base[i];
    const e = end[i];
    const t = e + idiv(f * (b - e), BPS_TOTAL);
    target.push(t < 0 ? 0 : t);
  }
  renormalize(target);
  return target;
}

/** Nudge the largest weight so the slice sums to exactly BPS_TOTAL. Mirrors
 *  `renormalize()` (first max on ties, single adjustment, clamp negative to 0). */
function renormalize(weights: number[]): void {
  if (weights.length === 0) return;
  const sum = weights.reduce((a, w) => a + w, 0);
  const delta = BPS_TOTAL - sum;
  if (delta === 0) return;
  let maxI = 0;
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[maxI]) maxI = i;
  }
  const adjusted = weights[maxI] + delta;
  weights[maxI] = adjusted < 0 ? 0 : adjusted;
}

/**
 * Civil year from a Unix timestamp in seconds (Howard Hinnant's algorithm).
 * Faithful port of `year_from_unix_secs()` so the backend derives `current_year`
 * exactly as the contract derives it from block time.
 */
export function yearFromUnixSecs(secs: number): number {
  const days = Math.trunc(secs / 86_400);
  const z = days + 719_468;
  const era = idiv(z >= 0 ? z : z - 146_096, 146_097);
  const doe = z - era * 146_097; // [0, 146096]
  const yoe = idiv(
    doe - idiv(doe, 1460) + idiv(doe, 36_524) - idiv(doe, 146_096),
    365,
  ); // [0,399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + idiv(yoe, 4) - idiv(yoe, 100)); // [0, 365]
  const mp = idiv(5 * doy + 2, 153); // [0, 11]
  const m = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  return m <= 2 ? y + 1 : y;
}

/** Current civil year (UTC), derived the same way the contract derives it. */
export function currentYear(nowMs: number = Date.now()): number {
  return yearFromUnixSecs(Math.trunc(nowMs / 1000));
}

/** Map a canonical-order bps vector onto `{ symbol: bps }`. */
export function vectorToAllocation(vec: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  ASSET_SYMBOLS.forEach((sym, i) => {
    out[sym] = vec[i] ?? 0;
  });
  return out;
}
