import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import type { ProfileReply } from '../agent/agent.parse';
import type { StarterPortfolioDto } from '../portfolio/portfolio.types';
import type { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

export interface OnboardingResultDto {
  profile: ProfileReply;
  starters: StarterPortfolioDto[];
}

/**
 * Onboarding flow (architecture §6): persist the user + answers, ask the agent
 * for a risk bucket, and return that bucket plus deterministic starter
 * portfolios. Vault creation itself is user-signed in the frontend; the backend
 * records `PortfolioMeta` later via `POST /portfolios`.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly portfolio: PortfolioService,
  ) {}

  async submit(dto: SubmitOnboardingDto): Promise<OnboardingResultDto> {
    const user = await this.prisma.user.upsert({
      where: { walletAddress: dto.owner },
      update: {},
      create: { walletAddress: dto.owner },
    });

    const profile = await this.agent.profileRisk(dto.answers, dto.demographics);

    await this.prisma.answer.create({
      data: {
        userId: user.id,
        answers: dto.answers.map((a) => ({
          questionId: a.questionId,
          value: a.value,
        })),
        demographics: dto.demographics,
      },
    });
    await this.prisma.profile.create({
      data: {
        userId: user.id,
        profile: profile.profile,
        reasoning: profile.reasoning,
        score: profile.score ?? null,
      },
    });

    return {
      profile,
      starters: this.portfolio.generateStarters(profile.profile),
    };
  }
}
