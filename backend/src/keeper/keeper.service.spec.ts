import { KeeperService } from './keeper.service';
import { ChainService, type VaultState } from '../chain/chain.service';
import { PricingService } from '../pricing/pricing.service';
import { BillingService } from '../billing/billing.service';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AssetSymbol } from '../config/constants';

const make = (): KeeperService =>
  new KeeperService(
    undefined as unknown as PrismaService,
    undefined as unknown as ChainService,
    undefined as unknown as PricingService,
    undefined as unknown as BillingService,
    undefined as unknown as AgentService,
  );

const prices: Record<AssetSymbol, bigint> = {
  mUSDC: 1_000_000n,
  mBTC: 65_000_000_000n,
  mNVDAx: 100_000_000n,
  mXAUT: 2_000_000_000n,
  mGOOGLx: 150_000_000n,
};

const vault = (
  holdings: Record<string, string>,
  target: Record<string, number>,
): VaultState => ({
  owner: 'o',
  agent: 'a',
  profile: 'Moderate', // drift band = 500 bps
  baseAllocation: {},
  currentTargetAllocation: target,
  holdings,
  targetAmountUsd: '0',
  targetYear: 2040,
  createdYear: 2020,
});

describe('KeeperService.decideRebalance', () => {
  it('is due when drift exceeds the band, value clears min-trade, and cooled down', () => {
    // $100 portfolio, 100% in mUSDC vs a 50/50 target -> 5000 bps drift.
    const d = make().decideRebalance(
      vault({ mUSDC: '100000000' }, { mBTC: 5000, mUSDC: 5000 }),
      prices,
      null,
    );
    expect(d.due).toBe(true);
    expect(d.maxDriftBps).toBe(5000);
  });

  it('is not due within the drift band', () => {
    const d = make().decideRebalance(
      vault({ mUSDC: '100000000' }, { mUSDC: 10000 }),
      prices,
      null,
    );
    expect(d.due).toBe(false);
    expect(d.reason).toContain('within band');
  });

  it('skips a sub-$1 trade — proves the value scale is real USD, not raw token×price', () => {
    // $1 portfolio with 5000 bps drift -> ~$0.50 trade, below the $1 min.
    const d = make().decideRebalance(
      vault({ mUSDC: '1000000' }, { mBTC: 5000, mUSDC: 5000 }),
      prices,
      null,
    );
    expect(d.due).toBe(false);
    expect(d.reason).toContain('below min trade');
  });

  it('is not due during the once-per-day cooldown', () => {
    const d = make().decideRebalance(
      vault({ mUSDC: '100000000' }, { mBTC: 5000, mUSDC: 5000 }),
      prices,
      new Date(),
    );
    expect(d.due).toBe(false);
    expect(d.reason).toContain('cooldown');
  });
});

describe('KeeperService.investIdle (deposit→buy)', () => {
  const chainMock = { idleMusdc: jest.fn(), executeBuy: jest.fn() };
  const makeWithChain = (): KeeperService =>
    new KeeperService(
      undefined as unknown as PrismaService,
      chainMock as unknown as ChainService,
      undefined as unknown as PricingService,
      undefined as unknown as BillingService,
      undefined as unknown as AgentService,
    );

  beforeEach(() => {
    chainMock.idleMusdc.mockReset();
    chainMock.executeBuy.mockReset().mockResolvedValue('tx');
  });

  it('invests when idle clears the min-trade threshold', async () => {
    chainMock.idleMusdc.mockResolvedValue(5_000_000n); // $5
    const r = await makeWithChain().investIdle('v');
    expect(chainMock.executeBuy).toHaveBeenCalledWith('v');
    expect(r.invested).toBe(true);
  });

  it('skips dust below the min-trade threshold (no executeBuy)', async () => {
    chainMock.idleMusdc.mockResolvedValue(500_000n); // $0.50 < $1
    const r = await makeWithChain().investIdle('v');
    expect(chainMock.executeBuy).not.toHaveBeenCalled();
    expect(r.invested).toBe(false);
    expect(r.reason).toContain('below min trade');
  });

  it('is idempotent under the in-flight lock (no double-buy)', async () => {
    chainMock.idleMusdc.mockResolvedValue(5_000_000n);
    const keeper = makeWithChain();
    const first = keeper.investIdle('v'); // acquires the lock synchronously
    const second = await keeper.investIdle('v'); // lock held → skip
    expect(second).toEqual({ invested: false, reason: 'already in flight' });
    await first;
    expect(chainMock.executeBuy).toHaveBeenCalledTimes(1);
  });
});
