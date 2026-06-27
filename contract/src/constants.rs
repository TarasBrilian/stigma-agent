//! Shared constants and the deterministic glide-path math.
//!
//! Units (must match `../backend` and `../frontend`): USD as fixed-point 6 dp;
//! weights as basis points (bps, Σ = 10000). **No floats anywhere** — all math
//! here is integer and deterministic (CLAUDE.md). Assets are addressed by a fixed
//! canonical index so the contract can iterate them (Odra mappings can't be
//! enumerated).

use odra::prelude::*;

/// Basis-points denominator (the sum every allocation must equal).
pub const BPS_TOTAL: u32 = 10_000;

/// Slippage cap applied to every router swap (1%).
pub const SLIPPAGE_BPS: u32 = 100;

/// Number of tradable assets, in canonical order (see below).
pub const ASSET_COUNT: usize = 5;

/// Canonical asset order shared with the backend/frontend:
/// `[mUSDC, mBTC, mNVDAx, mXAUT, mGOOGLx]`. Index 0 (mUSDC) is the base/quote.
pub const MUSDC_INDEX: usize = 0;

/// Risk profile — selects the de-risked END allocation of the glide path.
#[odra::odra_type]
pub enum Profile {
    Conservative,
    Moderate,
    Aggressive,
}

/// De-risked END allocation (bps, Σ = 10000) per profile, in canonical asset
/// order. Mirrors the "End (at goal year)" column in ARCHITECTURE.md §5.
pub fn end_allocation(profile: &Profile) -> [u32; ASSET_COUNT] {
    match profile {
        // mUSDC 70 · mXAUT 30
        Profile::Conservative => [7000, 0, 0, 3000, 0],
        // mUSDC 50 · mXAUT 50
        Profile::Moderate => [5000, 0, 0, 5000, 0],
        // mUSDC 40 · mBTC 20 · mXAUT 40
        Profile::Aggressive => [4000, 2000, 0, 4000, 0],
    }
}

/// Sum of a bps slice.
pub fn sum_bps(weights: &[u32]) -> u32 {
    weights.iter().copied().sum()
}

/// Glide-path target allocation (bps, Σ = 10000): interpolates from `base` (the
/// growth-tilted start) toward `end` (de-risked) as the goal approaches.
///
/// ```text
/// horizon    = target_year - created_year
/// years_left = max(0, target_year - current_year), capped at horizon
/// f          = clamp(years_left * 10000 / horizon, 0, 10000)   // 10000 far, 0 at goal
/// target[i]  = end[i] + f * (base[i] - end[i]) / 10000          // then renormalize to 10000
/// ```
pub fn glide_target(
    base: &[u32],
    end: &[u32],
    created_year: u32,
    target_year: u32,
    current_year: u32,
) -> Vec<u32> {
    let n = base.len();
    let horizon = target_year.saturating_sub(created_year) as i64;
    let mut years_left = target_year.saturating_sub(current_year) as i64;
    if horizon > 0 && years_left > horizon {
        years_left = horizon;
    }
    let f: i64 = if horizon == 0 {
        0
    } else {
        years_left * (BPS_TOTAL as i64) / horizon
    };

    let mut target: Vec<u32> = Vec::with_capacity(n);
    for i in 0..n {
        let b = base[i] as i64;
        let e = end[i] as i64;
        let t = e + f * (b - e) / (BPS_TOTAL as i64);
        target.push(if t < 0 { 0 } else { t as u32 });
    }
    renormalize(&mut target);
    target
}

/// Nudge the largest weight so the slice sums to exactly `BPS_TOTAL` (absorbs the
/// integer-division rounding remainder).
fn renormalize(weights: &mut [u32]) {
    if weights.is_empty() {
        return;
    }
    let sum: i64 = weights.iter().map(|w| *w as i64).sum();
    let delta = BPS_TOTAL as i64 - sum;
    if delta == 0 {
        return;
    }
    let mut max_i = 0usize;
    for i in 1..weights.len() {
        if weights[i] > weights[max_i] {
            max_i = i;
        }
    }
    let adjusted = weights[max_i] as i64 + delta;
    weights[max_i] = if adjusted < 0 { 0 } else { adjusted as u32 };
}

/// Civil year from a Unix timestamp in seconds (integer, no_std). Based on
/// Howard Hinnant's `civil_from_days` algorithm; valid across the contract's
/// lifetime. Block time on Casper is a Unix timestamp.
pub fn year_from_unix_secs(secs: u64) -> u32 {
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };
    year as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    // Moderate start: mBTC 20 · mNVDAx 30 · mXAUT 40 · mGOOGLx 10.
    const BASE: [u32; ASSET_COUNT] = [0, 2000, 3000, 4000, 1000];

    #[test]
    fn glide_far_from_goal_returns_base() {
        // current == created, goal far away -> f = 10000 -> base allocation.
        let end = end_allocation(&Profile::Moderate);
        let t = glide_target(&BASE, &end, 2020, 2040, 2020);
        assert_eq!(t, BASE.to_vec());
        assert_eq!(sum_bps(&t), BPS_TOTAL);
    }

    #[test]
    fn glide_at_goal_returns_end() {
        let end = end_allocation(&Profile::Moderate);
        let t = glide_target(&BASE, &end, 2020, 2040, 2040);
        assert_eq!(t, end.to_vec());
        assert_eq!(sum_bps(&t), BPS_TOTAL);
    }

    #[test]
    fn glide_midpoint_is_halfway() {
        let end = end_allocation(&Profile::Moderate); // [5000,0,0,5000,0]
        let t = glide_target(&BASE, &end, 2020, 2040, 2030);
        // f = 5000 -> (base + end) / 2 elementwise.
        assert_eq!(t, alloc::vec![2500, 1000, 1500, 4500, 500]);
        assert_eq!(sum_bps(&t), BPS_TOTAL);
    }

    #[test]
    fn glide_past_goal_clamps_to_end() {
        let end = end_allocation(&Profile::Moderate);
        let t = glide_target(&BASE, &end, 2020, 2040, 2050);
        assert_eq!(t, end.to_vec());
    }

    #[test]
    fn glide_always_sums_to_total() {
        let end = end_allocation(&Profile::Aggressive);
        for year in 2020..=2040 {
            let t = glide_target(&BASE, &end, 2020, 2040, year);
            assert_eq!(sum_bps(&t), BPS_TOTAL, "year {year}");
        }
    }

    #[test]
    fn end_allocations_are_valid() {
        for p in [
            Profile::Conservative,
            Profile::Moderate,
            Profile::Aggressive,
        ] {
            assert_eq!(sum_bps(&end_allocation(&p)), BPS_TOTAL);
        }
    }

    #[test]
    fn year_from_timestamp() {
        assert_eq!(year_from_unix_secs(0), 1970); // epoch
        assert_eq!(year_from_unix_secs(1_704_067_200), 2024); // 2024-01-01
        assert_eq!(year_from_unix_secs(1_719_792_000), 2024); // 2024-07-01
        assert_eq!(year_from_unix_secs(1_767_225_600), 2026); // 2026-01-01
    }
}
