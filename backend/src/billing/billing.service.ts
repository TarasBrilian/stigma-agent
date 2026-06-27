import { Injectable, Logger } from '@nestjs/common';
import { X402_FEE_BPS } from '../config/constants';

/**
 * x402 micro-fee, charged ONLY on rebalance (golden rule #7 — do not gate
 * other endpoints). Frames the agent as a paid autonomous service.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly facilitatorUrl = process.env.X402_FACILITATOR_URL ?? '';

  /** Fee in raw USD (6 dp) for a given portfolio value. */
  computeFee(portfolioValueUsd6: bigint): bigint {
    return (portfolioValueUsd6 * BigInt(X402_FEE_BPS)) / 10_000n;
  }

  /**
   * Pull the rebalance micro-fee via the x402 facilitator. Returns a receipt id
   * stored on the RebalanceLog.
   *
   * TODO: integrate the real x402 flow against `facilitatorUrl` (settle in
   * mUSDC). Until then this is a no-op placeholder so the keeper flow is wired.
   */
  chargeRebalanceFee(
    vaultHash: string,
    portfolioValueUsd6: bigint,
  ): Promise<{ receipt: string; feeUsd6: string }> {
    const fee = this.computeFee(portfolioValueUsd6);
    this.logger.debug(
      `chargeRebalanceFee(${vaultHash}) fee=${fee} via=${this.facilitatorUrl || 'unset'} (placeholder)`,
    );
    return Promise.resolve({
      receipt: `x402-placeholder-${vaultHash.slice(0, 8)}`,
      feeUsd6: fee.toString(),
    });
  }
}
