import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { AgentModule } from '../agent/agent.module';
import { PortfolioModule } from '../portfolio/portfolio.module';

@Module({
  imports: [AgentModule, PortfolioModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
