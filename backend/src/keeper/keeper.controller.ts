import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { KeeperService } from './keeper.service';
import { OracleOverrideDto } from './dto/oracle-override.dto';
import { FaucetDto } from './dto/faucet.dto';

/**
 * Demo controls (testnet). Keep these working (golden rule: demo-readiness) but
 * rate-limited (ThrottlerGuard) — they are powerful (oracle override moves every
 * vault's accounting; faucet mints) and otherwise unauthenticated, so the budget
 * (DEMO_RATE_TTL_MS / DEMO_RATE_LIMIT) caps abuse without blocking the live demo.
 */
@Controller()
@UseGuards(ThrottlerGuard)
export class KeeperController {
  constructor(private readonly keeper: KeeperService) {}

  /** Manually set a mock price (logged source=manual_override). */
  @Post('keeper/oracle/override')
  async override(@Body() dto: OracleOverrideDto): Promise<{ ok: true }> {
    await this.keeper.setOracleOverride(dto.token, BigInt(dto.price));
    return { ok: true };
  }

  /** Trigger a rebalance now without waiting for the loop. */
  @Post('keeper/rebalance/:vault')
  rebalanceNow(
    @Param('vault') vault: string,
  ): Promise<{ executed: boolean; reason: string }> {
    return this.keeper.triggerRebalance(vault, { force: true });
  }

  /** Invest idle mUSDC now (deposit→buy) without waiting for the loop. */
  @Post('keeper/invest/:vault')
  investNow(
    @Param('vault') vault: string,
  ): Promise<{ invested: boolean; reason: string }> {
    return this.keeper.investIdle(vault);
  }

  /** Mint test mUSDC. */
  @Post('faucet/musdc')
  async faucet(@Body() dto: FaucetDto): Promise<{ ok: true }> {
    await this.keeper.faucet(dto.owner, BigInt(dto.amount));
    return { ok: true };
  }
}
