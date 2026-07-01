/**
 * Display formatting for fixed-point values.
 *
 * This is the ONLY place numeric work happens in the frontend, and it is
 * formatting only — never arithmetic that decides anything (golden rule #2).
 * All USD math uses BigInt on the raw 6-dp integer so we never lose precision
 * through JS `number`.
 */

import type { Usd6 } from "./types";

const USD_DECIMALS = 6n;
const USD_SCALE = 10n ** USD_DECIMALS; // 1_000_000

/**
 * Format a raw fixed-point USD value (6 dp) as a human currency string.
 * @example formatUsd("1234560000") -> "$1,234.56"
 */
export function formatUsd(raw: Usd6 | bigint, opts?: { sign?: boolean }): string {
  let v = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  const negative = v < 0n;
  if (negative) v = -v;

  const whole = v / USD_SCALE;
  const frac = v % USD_SCALE;

  // Round the 6-dp fraction to 2 dp (cents) without floats.
  let cents = (frac + 5_000n) / 10_000n; // half-up
  let wholeAdj = whole;
  if (cents >= 100n) {
    wholeAdj += 1n;
    cents -= 100n;
  }

  const grouped = wholeAdj.toLocaleString("en-US");
  const centsStr = cents.toString().padStart(2, "0");
  const prefix = negative ? "-" : opts?.sign ? "+" : "";
  return `${prefix}$${grouped}.${centsStr}`;
}

/**
 * Parse a human dollar amount ("100", "100.50", "0.25") into a raw fixed-point
 * USD string (6 dp) — the exact inverse of `formatUsd`. This ENCODES the amount
 * the user typed into the contract's integer unit; it is the counterpart of the
 * display decode, NOT money math that decides a value (golden rule #2). BigInt-only
 * (no float → no precision loss). Throws on non-numeric input or > 6 decimals.
 * @example parseUsdToRaw("100.5") -> "100500000"
 */
export function parseUsdToRaw(input: string): Usd6 {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(input.trim());
  if (!match) {
    throw new Error(
      "Enter a dollar amount with up to 6 decimal places (e.g. 100 or 100.50).",
    );
  }
  const whole = BigInt(match[1]);
  const frac = BigInt((match[2] ?? "").padEnd(6, "0")); // right-pad to 6 dp
  const raw = whole * USD_SCALE + frac;
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  return raw.toString();
}

/** Convert bps (integer, Σ=10000) to a percent number for charts. 2000 -> 20. */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Format bps as a percent string. 2000 -> "20.00%". */
export function formatBps(bps: number, fractionDigits = 2): string {
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}

/** Format a progress value (bps of goal, 0..10000) as a clamped percent string. */
export function formatProgress(progressBps: number): string {
  const clamped = Math.max(0, Math.min(10_000, progressBps));
  return formatBps(clamped, 1);
}

/** Truncate a long hash/public key for display: hash-abc123…7f9d. */
export function truncateHash(hash: string, head = 6, tail = 4): string {
  if (!hash) return "";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** Human-friendly years-left label. */
export function formatYearsLeft(years: number): string {
  if (years <= 0) return "at goal";
  if (years < 1) return `${Math.round(years * 12)} months`;
  return `${years.toFixed(years < 10 ? 1 : 0)} years`;
}
