/**
 * Pure money + allocation helpers. No framework deps; no `number` for value math.
 *
 * Units (must match `../contract` and the frontend): USD is fixed-point with 6
 * decimals; weights are bps (Σ = 10000). The DB stores USD as a Decimal in
 * DOLLARS; the API/frontend speak the raw 6-dp integer string. These helpers
 * convert between the two and derive value/weights from on-chain holdings.
 */
import { Prisma } from '@prisma/client';
import {
  ASSET_SYMBOLS,
  BPS_TOTAL,
  TOKEN_DECIMALS,
  type AssetSymbol,
} from './constants';

/** DB Decimal (USD dollars) -> raw 6-dp string, e.g. 1234.56 -> "1234560000". */
export function decimalToUsd6(value: Prisma.Decimal): string {
  return value.times(1_000_000).toFixed(0);
}

/** Raw 6-dp string -> DB Decimal (USD dollars). Exact, no float. */
export function usd6ToDecimal(raw: string): Prisma.Decimal {
  return new Prisma.Decimal(raw).div(1_000_000);
}

/**
 * Human USD (a decimal number or string from a price feed) -> raw 6-dp bigint,
 * e.g. 65000.5 -> 65000500000n. Exact via Decimal (numbers are stringified first
 * so the shortest round-trippable form is parsed, not a float artifact); the
 * sub-micro-dollar remainder is rounded. Used to map oracle prices to raw 6 dp.
 */
export function usdToUsd6(value: string | number): bigint {
  const dec = new Prisma.Decimal(
    typeof value === 'number' ? String(value) : value,
  );
  return BigInt(dec.times(1_000_000).toFixed(0));
}

type Holdings = Partial<Record<string, string>>;
type Prices = Partial<Record<AssetSymbol, bigint>>;

/**
 * Total portfolio value in raw USD (6 dp) from raw token holdings × oracle
 * prices: holding [token base units] × price [USD/token, 6 dp] / 10^decimals.
 */
export function valueUsd6(holdings: Holdings, prices: Prices): bigint {
  const scale = 10n ** BigInt(TOKEN_DECIMALS);
  let total = 0n;
  for (const asset of ASSET_SYMBOLS) {
    const h = BigInt(holdings[asset] ?? '0');
    const p = prices[asset] ?? 0n;
    total += (h * p) / scale;
  }
  return total;
}

/**
 * Current weights in bps from holdings × prices (a ratio, so the token-decimals
 * scale cancels). Each weight is floored; the rounding remainder is not
 * redistributed — this is display only, never an executed number.
 */
export function weightsBps(
  holdings: Holdings,
  prices: Prices,
): Record<AssetSymbol, number> {
  const raw: Record<string, bigint> = {};
  let total = 0n;
  for (const asset of ASSET_SYMBOLS) {
    const v = BigInt(holdings[asset] ?? '0') * (prices[asset] ?? 0n);
    raw[asset] = v;
    total += v;
  }
  const out = {} as Record<AssetSymbol, number>;
  for (const asset of ASSET_SYMBOLS) {
    out[asset] =
      total === 0n ? 0 : Number((raw[asset] * BigInt(BPS_TOTAL)) / total);
  }
  return out;
}

/** Sum of an allocation's bps. */
export function allocationSumBps(
  alloc: Partial<Record<string, number>>,
): number {
  return Object.values(alloc).reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** True iff Σ == 10000 and every key is a known tradable asset with a non-negative weight. */
export function isValidAllocation(
  alloc: Partial<Record<string, number>>,
): boolean {
  const keys = Object.keys(alloc);
  if (keys.length === 0) return false;
  const known = new Set<string>(ASSET_SYMBOLS);
  if (!keys.every((k) => known.has(k))) return false;
  if (Object.values(alloc).some((v) => v == null || v < 0)) return false;
  return allocationSumBps(alloc) === BPS_TOTAL;
}
