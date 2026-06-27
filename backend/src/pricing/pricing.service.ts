import { Injectable, Logger } from '@nestjs/common';
import {
  ANNUAL_RETURN_BPS,
  type AssetSymbol,
  type Profile,
} from '../config/constants';

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
   * NVDA/GOOGL) mapped onto the mock assets, as raw USD (6 dp).
   */
  fetchPrices(): Promise<Record<AssetSymbol, bigint>> {
    // TODO: call the external price APIs (PRICE_API_KEY) and map to mock assets.
    this.logger.warn('PricingService.fetchPrices: not implemented');
    throw new Error('PricingService.fetchPrices: not implemented');
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
