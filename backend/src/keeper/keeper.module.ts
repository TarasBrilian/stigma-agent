import { Module } from '@nestjs/common';
import { KeeperService } from './keeper.service';
import { KeeperController } from './keeper.controller';
import { ChainModule } from '../chain/chain.module';
import { PricingModule } from '../pricing/pricing.module';
import { BillingModule } from '../billing/billing.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [ChainModule, PricingModule, BillingModule, AgentModule],
  controllers: [KeeperController],
  providers: [KeeperService],
  exports: [KeeperService],
})
export class KeeperModule {}
