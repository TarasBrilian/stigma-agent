import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ChainModule } from './chain/chain.module';
import { AgentModule } from './agent/agent.module';
import { PricingModule } from './pricing/pricing.module';
import { BillingModule } from './billing/billing.module';
import { KeeperModule } from './keeper/keeper.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    // Infrastructure boundaries:
    ChainModule, //  the ONLY module that talks to Casper
    AgentModule, //  the ONLY module that calls OpenRouter
    PricingModule,
    BillingModule,
    // Orchestration + API:
    KeeperModule,
    PortfolioModule,
    OnboardingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
