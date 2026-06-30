import { Module } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChainModule } from '../chain/chain.module';
import { PricingModule } from '../pricing/pricing.module';
import { AgentModule } from '../agent/agent.module';
import { VaultOwnerGuard, WalletAuthGuard } from '../auth/wallet-auth.guard';

@Module({
  imports: [ChainModule, PricingModule, AgentModule],
  controllers: [PortfolioController, ChatController],
  providers: [PortfolioService, ChatService, WalletAuthGuard, VaultOwnerGuard],
  exports: [PortfolioService],
})
export class PortfolioModule {}
