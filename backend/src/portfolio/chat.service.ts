import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PortfolioMeta } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { AgentService } from '../agent/agent.service';
import { decimalToUsd6, valueUsd6, weightsBps } from '../config/money';
import type { ChatMessageDto } from './portfolio.types';

/** Display-only USD dollars from a raw 6-dp string (for the agent snapshot only —
 *  never value math that decides anything; executed amounts stay bigint). */
function toDollars(raw6: string): number {
  return Math.round(Number(raw6) / 10_000) / 100;
}
/** Display-only percent map from a bps map (2000 bps → 20). */
function toPercent(bps: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(bps).map(([asset, v]) => [asset, v / 100]),
  );
}

/**
 * Agent Q&A about a portfolio. Persists both the question and the answer, and
 * returns the agent's reply (display-only — `agent.answer` never produces an
 * executed number). The snapshot is the off-chain mirror enriched with LIVE
 * on-chain state via `chain`, so answers can reference real value/holdings.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly agent: AgentService,
  ) {}

  async ask(vaultHash: string, message: string): Promise<ChatMessageDto> {
    const meta = await this.prisma.portfolioMeta.findUnique({
      where: { vaultHash },
    });
    if (!meta) throw new NotFoundException(`portfolio ${vaultHash} not found`);

    await this.prisma.chatMessage.create({
      data: { vaultHash, role: 'user', content: message },
    });

    const snapshot = await this.buildSnapshot(vaultHash, meta);
    const answer = await this.agent.answer(snapshot, message);

    const saved = await this.prisma.chatMessage.create({
      data: { vaultHash, role: 'agent', content: answer },
    });
    return {
      id: saved.id,
      role: 'agent',
      content: saved.content,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * The off-chain mirror (name/profile/goal) enriched with LIVE on-chain state
   * (current value, current vs target allocation, holdings) read via `chain`. If
   * the live read fails, degrade to the mirror-only snapshot so chat still works.
   */
  private async buildSnapshot(
    vaultHash: string,
    meta: PortfolioMeta,
  ): Promise<Record<string, unknown>> {
    const base = {
      name: meta.name,
      profile: meta.profile,
      goal: {
        targetUsd: toDollars(decimalToUsd6(meta.targetAmountUsd)),
        targetYear: meta.targetYear,
      },
    };
    try {
      const [state, prices] = await Promise.all([
        this.chain.viewState(vaultHash),
        this.chain.getPrices(),
      ]);
      // Human-readable units so the LLM answers in $ / % instead of fumbling raw
      // 6-dp + bps. Display-only — never used for value math (golden rule).
      return {
        ...base,
        currentValueUsd: toDollars(
          valueUsd6(state.holdings, prices).toString(),
        ),
        currentAllocationPct: toPercent(weightsBps(state.holdings, prices)),
        targetAllocationPct: toPercent(state.currentTargetAllocation),
      };
    } catch (err) {
      this.logger.warn(
        `chat snapshot: live state unavailable; using the mirror only: ${(err as Error).message}`,
      );
      return base;
    }
  }
}
