import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { decimalToUsd6 } from '../config/money';
import type { ChatMessageDto } from './portfolio.types';

/**
 * Agent Q&A about a portfolio. Persists both the question and the answer, and
 * returns the agent's reply (display-only — `agent.answer` never produces an
 * executed number). The snapshot is built from the off-chain mirror; richer live
 * holdings can be layered in once `chain.viewState` is implemented.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
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

    const snapshot = {
      name: meta.name,
      profile: meta.profile,
      baseAllocation: meta.baseAllocation,
      targetAmountUsd: decimalToUsd6(meta.targetAmountUsd),
      targetYear: meta.targetYear,
    };
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
}
