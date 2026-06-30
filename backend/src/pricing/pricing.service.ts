import { Injectable, Logger } from '@nestjs/common';
import {
  ANNUAL_RETURN_BPS,
  type AssetSymbol,
  type Profile,
} from '../config/constants';
import { usdToUsd6 } from '../config/money';

/** CoinGecko `simple/price` shape for the ids we request. */
interface CoinGeckoPrices {
  bitcoin?: { usd?: number };
  'tether-gold'?: { usd?: number };
}

/**
 * Twelve Data single-symbol `/price` shape — VERIFIED live as the flat
 * `{ "price": "287.88" }`. We fetch one symbol per request (not the multi-symbol
 * nested shape) so we rely only on this confirmed form. Error bodies carry
 * `status: "error"` + a `message`.
 */
interface StockPrice {
  price?: string | number;
  status?: string;
  message?: string;
}

/** Max time to wait on any single price source before the cron gives up. */
const FETCH_TIMEOUT_MS = 8_000;

/** Live contribution projection (deterministic — never produced by the LLM). */
export interface Projection {
  requiredMonthlyUsd: string; // raw 6 dp; "0" means at/ahead of target
  onTrack: boolean;
  returnAssumptionBps: number;
  yearsLeft: number;
  presentValueUsd: string;
  futureValueUsd: string;
}

const USD_SCALE = 1_000_000;

/**
 * External price fetch + the deterministic contribution projection. The backend
 * owns the projection's return assumption; the glide target is NOT here.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  /**
   * Fetch real reference prices (CoinGecko for BTC/gold; a stock source for
   * NVDA/GOOGL) mapped onto the mock assets, as raw USD (6 dp). `mUSDC` is pinned
   * to $1. Throws if any source is unreachable/malformed — the keeper's
   * `feedOracle` wraps this in a try/catch so a price-source outage skips the
   * cycle rather than crashing the loop (it does NOT push a stale price).
   */
  async fetchPrices(): Promise<Record<AssetSymbol, bigint>> {
    const [crypto, stocks] = await Promise.all([
      this.fetchCryptoPrices(),
      this.fetchStockPrices(),
    ]);
    return {
      mUSDC: 1_000_000n, // pinned to $1.00 (raw 6 dp)
      mBTC: crypto.mBTC,
      mNVDAx: stocks.mNVDAx,
      mXAUT: crypto.mXAUT,
      mGOOGLx: stocks.mGOOGLx,
    };
  }

  /** BTC + gold (mXAUT ≈ Tether Gold ≈ 1 oz) from CoinGecko (free, key optional). */
  private async fetchCryptoPrices(): Promise<{ mBTC: bigint; mXAUT: bigint }> {
    const base =
      process.env.COINGECKO_URL ?? 'https://api.coingecko.com/api/v3';
    const headers: Record<string, string> = {};
    const key = process.env.COINGECKO_API_KEY;
    if (key) headers['x-cg-demo-api-key'] = key;

    const data = await this.getJson<CoinGeckoPrices>(
      `${base}/simple/price?ids=bitcoin,tether-gold&vs_currencies=usd`,
      'CoinGecko',
      headers,
    );
    const btc = data.bitcoin?.usd;
    const gold = data['tether-gold']?.usd;
    if (!this.isPositive(btc) || !this.isPositive(gold)) {
      throw new Error(
        'CoinGecko: missing/invalid bitcoin or tether-gold usd price',
      );
    }
    return { mBTC: usdToUsd6(btc), mXAUT: usdToUsd6(gold) };
  }

  /** NVDA + GOOGL from a keyed stock source (Twelve Data by default). */
  private async fetchStockPrices(): Promise<{
    mNVDAx: bigint;
    mGOOGLx: bigint;
  }> {
    const key = process.env.PRICE_API_KEY;
    if (!key) {
      throw new Error(
        'PRICE_API_KEY is not set — export it in backend/.env (stock price source; see .env.example)',
      );
    }
    const base = process.env.STOCK_API_URL ?? 'https://api.twelvedata.com';
    // One request per symbol (the verified flat shape), fetched concurrently.
    const [mNVDAx, mGOOGLx] = await Promise.all([
      this.fetchStockPrice(base, key, 'NVDA'),
      this.fetchStockPrice(base, key, 'GOOGL'),
    ]);
    return { mNVDAx, mGOOGLx };
  }

  /** One symbol's price via the verified single-symbol shape `{ "price": "..." }`. */
  private async fetchStockPrice(
    base: string,
    key: string,
    symbol: string,
  ): Promise<bigint> {
    const label = `stock source (${symbol})`;
    const data = await this.getJson<StockPrice>(
      `${base}/price?symbol=${symbol}&apikey=${encodeURIComponent(key)}`,
      label,
    );
    // Twelve Data sometimes returns 200 + an error body (e.g. rate limit).
    if (data.status === 'error') {
      throw new Error(`${label}: ${data.message ?? 'upstream error'}`);
    }
    if (!this.isPositive(data.price)) {
      throw new Error(`${label}: missing/invalid price`);
    }
    return usdToUsd6(data.price);
  }

  /** GET + parse JSON with a timeout. Errors carry the SOURCE label, never the keyed URL. */
  private async getJson<T>(
    url: string,
    source: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`${source}: HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /** Narrows to a finite, strictly-positive USD price (number or numeric string). */
  private isPositive(
    value: string | number | undefined,
  ): value is string | number {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n > 0;
  }

  /**
   * Required monthly contribution to reach the goal, recomputed live from the
   * current actual value so the on-track indicator self-corrects.
   *
   * NOTE: this is a deterministic ESTIMATE for display. It uses `number` for the
   * compound-interest curve; production should swap to a decimal library
   * (e.g. decimal.js) for exactness. It never drives an executed amount.
   */
  projectContribution(input: {
    presentValueUsd6: bigint;
    targetAmountUsd6: bigint;
    profile: Profile;
    yearsLeft: number;
  }): Projection {
    const returnBps = ANNUAL_RETURN_BPS[input.profile];
    const PV = Number(input.presentValueUsd6) / USD_SCALE;
    const FV = Number(input.targetAmountUsd6) / USD_SCALE;
    const r = returnBps / 10_000;
    const n = Math.max(0, input.yearsLeft);
    const i = Math.pow(1 + r, 1 / 12) - 1;
    const m = 12 * n;

    let pmt: number;
    if (m <= 0 || i === 0) {
      pmt = m <= 0 ? Math.max(0, FV - PV) : (FV - PV) / m;
    } else {
      pmt = ((FV - PV * Math.pow(1 + i, m)) * i) / (Math.pow(1 + i, m) - 1);
    }

    const onTrack = pmt <= 0;
    const required = Math.max(0, Math.round(pmt * USD_SCALE));
    return {
      requiredMonthlyUsd: String(required),
      onTrack,
      returnAssumptionBps: returnBps,
      yearsLeft: n,
      presentValueUsd: input.presentValueUsd6.toString(),
      futureValueUsd: input.targetAmountUsd6.toString(),
    };
  }
}
