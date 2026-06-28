/**
 * Pins the off-chain glide port to the contract. These are the EXACT test
 * vectors from `../../contract/src/constants.rs` — if the on-chain glide changes,
 * these fail, forcing this file back in sync (preserving golden rule #5's intent).
 */
import { END_ALLOCATION, glideTarget, yearFromUnixSecs } from './glide';

// Moderate start: mBTC 20 · mNVDAx 30 · mXAUT 40 · mGOOGLx 10 (canonical order).
const BASE = [0, 2000, 3000, 4000, 1000];
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('glideTarget (mirrors constants.rs)', () => {
  it('far from goal (current == created) returns base', () => {
    const t = glideTarget(BASE, END_ALLOCATION.Moderate, 2020, 2040, 2020);
    expect(t).toEqual(BASE);
    expect(sum(t)).toBe(10000);
  });

  it('at goal year returns end', () => {
    const t = glideTarget(BASE, END_ALLOCATION.Moderate, 2020, 2040, 2040);
    expect(t).toEqual(END_ALLOCATION.Moderate);
    expect(sum(t)).toBe(10000);
  });

  it('midpoint is halfway (elementwise (base+end)/2)', () => {
    const t = glideTarget(BASE, END_ALLOCATION.Moderate, 2020, 2040, 2030);
    expect(t).toEqual([2500, 1000, 1500, 4500, 500]);
    expect(sum(t)).toBe(10000);
  });

  it('past goal clamps to end', () => {
    const t = glideTarget(BASE, END_ALLOCATION.Moderate, 2020, 2040, 2050);
    expect(t).toEqual(END_ALLOCATION.Moderate);
  });

  it('always sums to 10000 across the horizon', () => {
    for (let year = 2020; year <= 2040; year++) {
      const t = glideTarget(BASE, END_ALLOCATION.Aggressive, 2020, 2040, year);
      expect(sum(t)).toBe(10000);
    }
  });

  it('horizon == 0 is guarded (returns end, no divide-by-zero)', () => {
    const t = glideTarget(BASE, END_ALLOCATION.Moderate, 2040, 2040, 2040);
    expect(sum(t)).toBe(10000);
    expect(t).toEqual(END_ALLOCATION.Moderate);
  });

  it('all end allocations are valid (Σ = 10000)', () => {
    expect(sum(END_ALLOCATION.Conservative)).toBe(10000);
    expect(sum(END_ALLOCATION.Moderate)).toBe(10000);
    expect(sum(END_ALLOCATION.Aggressive)).toBe(10000);
  });
});

describe('yearFromUnixSecs (mirrors constants.rs)', () => {
  it('matches the contract vectors', () => {
    expect(yearFromUnixSecs(0)).toBe(1970);
    expect(yearFromUnixSecs(1_704_067_200)).toBe(2024); // 2024-01-01
    expect(yearFromUnixSecs(1_719_792_000)).toBe(2024); // 2024-07-01
    expect(yearFromUnixSecs(1_767_225_600)).toBe(2026); // 2026-01-01
  });
});
