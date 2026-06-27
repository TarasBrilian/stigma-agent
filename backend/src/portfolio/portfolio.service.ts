import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { PricingService, type Projection } from '../pricing/pricing.service';
import { AgentService } from '../agent/agent.service';
import {
  BPS_TOTAL,
  PROFILE_BLURB,
  STARTER_ALLOCATION_BPS,
  STARTER_DEFAULT_TARGET_USD6,
  STARTER_HORIZONS_YEARS,
  type Profile,
} from '../config/constants';
import {
  decimalToUsd6,
  isValidAllocation,
  usd6ToDecimal,
  valueUsd6,
  weightsBps,
} from '../config/money';
import type { RegisterPortfolioDto } from './dto/register-portfolio.dto';
import type {
  AllocationDto,
  PortfolioMetaDto,
  PortfolioStateDto,
  PortfolioSummaryDto,
  RebalanceLogEntryDto,
  StarterPortfolioDto,
  SuggestAllocationResultDto,
  SwapLegDto,
} from './portfolio.types';

type MetaWithUser = Prisma.PortfolioMetaGetPayload<{
  include: { user: true };
}>;

/**
 * Portfolio metadata mirror + merged read surface. Reads LIVE on-chain state via
 * `chain` (never the DB as money truth) and merges it with the off-chain mirror.
 * Owns no glide math — the current target comes from `chain.viewState`.
 *
 * NOTE: endpoints that need live value (`get`, `list` with portfolios,
 * `projection`) depend on the `chain` module, which is stubbed until the Casper
 * contracts are deployed; they surface the chain error until then. Endpoints that
 * don't (`register`, `generateStarters`, `suggest`, `activity`) work today.
 */
@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly pricing: PricingService,
    private readonly agent: AgentService,
  ) {}

  /** Record the off-chain mirror after a user-signed `create_vault`. */
  async register(dto: RegisterPortfolioDto): Promise<PortfolioMetaDto> {
    if (!isValidAllocation(dto.baseAllocation)) {
      throw new BadRequestException(
        'baseAllocation must sum to 10000 bps across known assets',
      );
    }
    const user = await this.prisma.user.upsert({
      where: { walletAddress: dto.owner },
      update: {},
      create: { walletAddress: dto.owner },
    });
    const meta = await this.prisma.portfolioMeta.create({
      data: {
        vaultHash: dto.vaultHash,
        userId: user.id,
        name: dto.name,
        profile: dto.profile,
        baseAllocation: dto.baseAllocation,
        targetAmountUsd: usd6ToDecimal(dto.targetAmountUsd),
        targetYear: dto.targetYear,
        createdYear: new Date().getFullYear(),
      },
      include: { user: true },
    });
    return this.toMetaDto(meta);
  }

  /** Dashboard list for an owner. Empty list needs no chain read. */
  async list(owner: string): Promise<PortfolioSummaryDto[]> {
    if (!owner) throw new BadRequestException('owner is required');
    const metas = await this.prisma.portfolioMeta.findMany({
      where: { user: { walletAddress: owner } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    if (metas.length === 0) return [];

    const prices = await this.chain.getPrices();
    return Promise.all(
      metas.map(async (meta) => {
        const state = await this.chain.viewState(meta.vaultHash);
        const value = valueUsd6(state.holdings, prices);
        const target = BigInt(decimalToUsd6(meta.targetAmountUsd));
        return {
          meta: this.toMetaDto(meta),
          totalValueUsd: value.toString(),
          progressBps: this.progressBps(value, target, true),
        };
      }),
    );
  }

  /** Single merged portfolio view: off-chain meta + live on-chain state. */
  async get(vaultHash: string): Promise<PortfolioStateDto> {
    const meta = await this.findMeta(vaultHash);
    const [state, prices] = await Promise.all([
      this.chain.viewState(vaultHash),
      this.chain.getPrices(),
    ]);
    const value = valueUsd6(state.holdings, prices);
    const target = BigInt(decimalToUsd6(meta.targetAmountUsd));
    return {
      ...this.toMetaDto(meta),
      holdings: state.holdings,
      currentAllocation: weightsBps(state.holdings, prices),
      currentTargetAllocation: state.currentTargetAllocation,
      totalValueUsd: value.toString(),
      progressBps: this.progressBps(value, target, false),
    };
  }

  /** Live contribution projection (deterministic — see PricingService). */
  async projection(vaultHash: string): Promise<Projection> {
    const meta = await this.findMeta(vaultHash);
    const [state, prices] = await Promise.all([
      this.chain.viewState(vaultHash),
      this.chain.getPrices(),
    ]);
    return this.pricing.projectContribution({
      presentValueUsd6: valueUsd6(state.holdings, prices),
      targetAmountUsd6: BigInt(decimalToUsd6(meta.targetAmountUsd)),
      profile: meta.profile,
      yearsLeft: Math.max(0, meta.targetYear - new Date().getFullYear()),
    });
  }

  /** Rebalance history with the agent's rationale (DB only — no chain). */
  async activity(vaultHash: string): Promise<RebalanceLogEntryDto[]> {
    const logs = await this.prisma.rebalanceLog.findMany({
      where: { vaultHash },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    return logs.map((log) => ({
      id: log.id,
      vaultHash: log.vaultHash,
      timestamp: log.timestamp.toISOString(),
      preWeights: log.preWeights as unknown as AllocationDto,
      postWeights: log.postWeights as unknown as AllocationDto,
      swaps: log.swaps as unknown as SwapLegDto[],
      rationale: log.rationale,
      x402Receipt: log.x402Receipt ?? undefined,
    }));
  }

  /** Deterministic starter portfolios for a profile (user-editable suggestions). */
  generateStarters(profile: Profile): StarterPortfolioDto[] {
    const currentYear = new Date().getFullYear();
    return STARTER_HORIZONS_YEARS.map((horizon) => ({
      name: `${profile} · ${horizon}-year goal`,
      profile,
      allocation: STARTER_ALLOCATION_BPS[profile],
      targetAmountUsd: STARTER_DEFAULT_TARGET_USD6,
      targetYear: currentYear + horizon,
      rationale: PROFILE_BLURB[profile],
    }));
  }

  /**
   * Agent-suggested allocation for a custom goal. The LLM output is validated and
   * is USER-EDITABLE; on failure or an invalid result we fall back to the profile
   * preset so the endpoint always returns a usable Σ=10000 allocation.
   */
  async suggest(goal: {
    profile: Profile;
    targetAmountUsd: string;
    targetYear: number;
    note?: string;
  }): Promise<SuggestAllocationResultDto> {
    try {
      const res = await this.agent.suggestAllocation(goal.profile, {
        targetAmountUsd: goal.targetAmountUsd,
        targetYear: goal.targetYear,
        note: goal.note,
      });
      if (isValidAllocation(res.allocation)) return res;
      this.logger.warn('agent suggestAllocation invalid; using preset');
    } catch (err) {
      this.logger.warn(
        `agent suggestAllocation failed; using preset: ${(err as Error).message}`,
      );
    }
    return {
      allocation: STARTER_ALLOCATION_BPS[goal.profile],
      rationale: `Starter ${goal.profile} allocation (preset). Edit before creating your vault.`,
    };
  }

  /* ------------------------------- helpers -------------------------------- */

  private async findMeta(vaultHash: string): Promise<MetaWithUser> {
    const meta = await this.prisma.portfolioMeta.findUnique({
      where: { vaultHash },
      include: { user: true },
    });
    if (!meta) throw new NotFoundException(`portfolio ${vaultHash} not found`);
    return meta;
  }

  private progressBps(value: bigint, target: bigint, cap: boolean): number {
    if (target <= 0n) return 0;
    const bps = Number((value * BigInt(BPS_TOTAL)) / target);
    return cap ? Math.min(BPS_TOTAL, bps) : bps;
  }

  private toMetaDto(meta: MetaWithUser): PortfolioMetaDto {
    return {
      vaultHash: meta.vaultHash,
      owner: meta.user.walletAddress,
      name: meta.name,
      profile: meta.profile,
      baseAllocation: meta.baseAllocation as unknown as AllocationDto,
      targetAmountUsd: decimalToUsd6(meta.targetAmountUsd),
      targetYear: meta.targetYear,
      createdYear: meta.createdYear,
      createdAt: meta.createdAt.toISOString(),
    };
  }
}
