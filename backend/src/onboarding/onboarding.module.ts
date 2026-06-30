import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { AgentModule } from '../agent/agent.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { WalletAuthGuard } from '../auth/wallet-auth.guard';

@Module({
  imports: [AgentModule, PortfolioModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, WalletAuthGuard],
})
export class OnboardingModule {}
