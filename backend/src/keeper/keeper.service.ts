import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService, type VaultState } from '../chain/chain.service';
import { PricingService } from '../pricing/pricing.service';
import { BillingService } from '../billing/billing.service';
import { AgentService } from '../agent/agent.service';
import {
  ASSET_SYMBOLS,
  DRIFT_BAND_BPS,
  KEEPER,
  type AssetSymbol,
} from '../config/constants';
import { valueUsd6, weightsBps } from '../config/money';

interface RebalanceDecision {
  due: boolean;
  maxDriftBps: number;
  estimatedTradeUsd6: bigint;
  reason: string;
}

/**
 * The keeper owns the rebalance DECISION (drift band) and orchestration. It
 * feeds the oracle, scans vaults, and triggers agent actions via `chain`.
 *
 * Guards that MUST stay (golden rule #6): min-trade size, max once/day/vault,
 * and the idempotency lock (prevents overlapping loops / double execution).
 */
@Injectable()
export class KeeperService {
  private readonly logger = new Logger(KeeperService.name);
  /** Idempotency lock: vault hashes currently being processed. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly pricing: PricingService,
    private readonly billing: BillingService,
    private readonly agent: AgentService,
  ) {}

  /* ------------------------------ price loop ------------------------------ */

  @Cron(CronExpression.EVERY_5_MINUTES)
  async feedOracle(): Promise<void> {
    try {
      const prices = await this.pricing.fetchPrices();
      for (const token of ASSET_SYMBOLS) {
        const price = prices[token];
        if (price !== undefined) await this.chain.setPrice(token, price);
      }
      this.logger.log('Oracle price feed complete (source=keeper)');
    } catch (err) {
      this.logger.warn(`feedOracle skipped: ${(err as Error).message}`);
    }
  }

  /* ---------------------------- rebalance loop ---------------------------- */

  @Cron(CronExpression.EVERY_HOUR)
  async scanAndRebalance(): Promise<void> {
    const vaults = await this.prisma.portfolioMeta.findMany({
      select: { vaultHash: true },
    });
    for (const { vaultHash } of vaults) {
      try {
        await this.triggerRebalance(vaultHash);
      } catch (err) {
        this.logger.warn(
          `rebalance ${vaultHash} skipped: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Evaluate + (if due, or forced) execute a rebalance for one vault, behind
   * the idempotency lock and all keeper guards.
   */
  async triggerRebalance(
    vaultHash: string,
    opts: { force?: boolean } = {},
  ): Promise<{ executed: boolean; reason: string }> {
    if (this.inFlight.has(vaultHash)) {
      return { executed: false, reason: 'already in flight' };
    }
    this.inFlight.add(vaultHash);
    try {
      const [state, prices] = await Promise.all([
        this.chain.viewState(vaultHash),
        this.chain.getPrices(),
      ]);
      const lastAt = await this.lastRebalanceAt(vaultHash);
      const decision = this.decideRebalance(state, prices, lastAt);

      if (!opts.force && !decision.due) {
        return { executed: false, reason: decision.reason };
      }

      const totalValue = valueUsd6(state.holdings, prices);
      const fee = await this.billing.chargeRebalanceFee(vaultHash, totalValue);
      await this.chain.rebalance(vaultHash);

      const post = await this.chain.viewState(vaultHash);
      const rationale = await this.agent.explainRebalance({
        preWeights: weightsBps(state.holdings, prices),
        postWeights: weightsBps(post.holdings, prices),
        swaps: [],
      });

      await this.prisma.rebalanceLog.create({
        data: {
          vaultHash,
          preWeights: weightsBps(state.holdings, prices),
          postWeights: weightsBps(post.holdings, prices),
          swaps: [],
          rationale,
          x402Receipt: fee.receipt,
        },
      });
      return { executed: true, reason: decision.reason };
    } finally {
      this.inFlight.delete(vaultHash);
    }
  }

  /* ----------------------------- demo actions ----------------------------- */

  async setOracleOverride(
    token: AssetSymbol,
    priceUsd6: bigint,
  ): Promise<void> {
    // Logged with source=manual-override by the chain/price layer.
    await this.chain.setPrice(token, priceUsd6);
  }

  async faucet(owner: string, amountUsd6: bigint): Promise<void> {
    await this.chain.faucetMint(owner, amountUsd6);
  }

  /* ------------------------------ decision -------------------------------- */

  /** Pure, deterministic rebalance decision (no LLM, no float for the gate). */
  decideRebalance(
    state: VaultState,
    prices: Record<AssetSymbol, bigint>,
    lastRebalanceAt: Date | null,
  ): RebalanceDecision {
    const total = valueUsd6(state.holdings, prices);
    const current = weightsBps(state.holdings, prices);
    const target = state.currentTargetAllocation;

    let maxDriftBps = 0;
    for (const asset of ASSET_SYMBOLS) {
      const drift = Math.abs((current[asset] ?? 0) - (target[asset] ?? 0));
      if (drift > maxDriftBps) maxDriftBps = drift;
    }

    const band = DRIFT_BAND_BPS[state.profile];
    const estimatedTradeUsd6 = (total * BigInt(maxDriftBps)) / 10_000n;
    const cooledDown =
      !lastRebalanceAt ||
      Date.now() - lastRebalanceAt.getTime() >= KEEPER.minRebalanceIntervalMs;

    const due =
      maxDriftBps >= band &&
      cooledDown &&
      estimatedTradeUsd6 >= KEEPER.minTradeUsd6;

    const reason = !cooledDown
      ? 'cooldown (once/day)'
      : maxDriftBps < band
        ? `within band (${maxDriftBps} < ${band} bps)`
        : estimatedTradeUsd6 < KEEPER.minTradeUsd6
          ? 'below min trade size'
          : `drift ${maxDriftBps} bps >= band ${band} bps`;

    return { due, maxDriftBps, estimatedTradeUsd6, reason };
  }

  /* ------------------------------ helpers --------------------------------- */

  private async lastRebalanceAt(vaultHash: string): Promise<Date | null> {
    const last = await this.prisma.rebalanceLog.findFirst({
      where: { vaultHash },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    return last?.timestamp ?? null;
  }
}
