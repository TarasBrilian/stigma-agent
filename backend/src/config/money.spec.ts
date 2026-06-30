import { Prisma } from '@prisma/client';
import {
  allocationSumBps,
  decimalToUsd6,
  isValidAllocation,
  usd6ToDecimal,
  usdToUsd6,
  valueUsd6,
  weightsBps,
} from './money';

describe('money', () => {
  describe('decimal <-> usd6', () => {
    it('converts DB dollars to a raw 6-dp string', () => {
      expect(decimalToUsd6(new Prisma.Decimal('1234.56'))).toBe('1234560000');
      expect(decimalToUsd6(new Prisma.Decimal('100000'))).toBe('100000000000');
    });

    it('round-trips raw 6-dp back to dollars', () => {
      expect(usd6ToDecimal('1234560000').toFixed(6)).toBe('1234.560000');
      expect(decimalToUsd6(usd6ToDecimal('999999'))).toBe('999999');
    });

    it('converts a human USD price (number or string) to raw 6-dp bigint', () => {
      expect(usdToUsd6(65000.5)).toBe(65_000_500_000n); // no float drift
      expect(usdToUsd6('2350')).toBe(2_350_000_000n);
      expect(usdToUsd6(1)).toBe(1_000_000n);
      expect(usdToUsd6('0.123456')).toBe(123_456n);
    });
  });

  describe('valueUsd6', () => {
    it('values holdings × price in USD (6 dp), normalizing token decimals', () => {
      // 2.0 mBTC (6dp) at $65,000 (6dp) = $130,000 raw.
      const value = valueUsd6({ mBTC: '2000000' }, { mBTC: 65_000_000_000n });
      expect(value).toBe(130_000_000_000n);
    });

    it('is zero for empty holdings', () => {
      expect(valueUsd6({}, {})).toBe(0n);
    });
  });

  describe('weightsBps', () => {
    it('derives weights as a ratio (scale cancels)', () => {
      const w = weightsBps(
        { mBTC: '1000000', mUSDC: '1000000' },
        { mBTC: 2_000_000n, mUSDC: 1_000_000n },
      );
      // values 2:1 -> 6666 / 3333 bps (floored).
      expect(w.mBTC).toBe(6666);
      expect(w.mUSDC).toBe(3333);
    });

    it('is all-zero when total value is zero', () => {
      const w = weightsBps({}, {});
      expect(w.mBTC).toBe(0);
      expect(w.mUSDC).toBe(0);
    });
  });

  describe('allocation validation', () => {
    it('accepts a Σ=10000 allocation over known assets', () => {
      expect(isValidAllocation({ mBTC: 6000, mUSDC: 4000 })).toBe(true);
      expect(allocationSumBps({ mBTC: 6000, mUSDC: 4000 })).toBe(10000);
    });

    it('rejects wrong sums, unknown assets, and empties', () => {
      expect(isValidAllocation({ mBTC: 6000 })).toBe(false);
      expect(isValidAllocation({ doge: 10000 })).toBe(false);
      expect(isValidAllocation({ mBTC: -1, mUSDC: 10001 })).toBe(false);
      expect(isValidAllocation({})).toBe(false);
    });
  });
});
