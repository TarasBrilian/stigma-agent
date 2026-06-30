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

// Proves the agent-resilience fix UNBLOCKS the keeper: a forced rebalance now
// completes and persists a RebalanceLog with the deterministic rationale even
// with no OPENROUTER_API_KEY (the rebalance side of the loop, sans Postgres).
describe('KeeperService.triggerRebalance (no OpenRouter → deterministic rationale)', () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  beforeAll(() => delete process.env.OPENROUTER_API_KEY);
  afterAll(() => {
    if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
  });

  it('forced rebalance writes a RebalanceLog with a non-empty rationale', async () => {
    const before = vault({ mUSDC: '100000000' }, { mBTC: 5000, mUSDC: 5000 });
    const after = vault(
      { mUSDC: '50000000', mBTC: '769' },
      { mBTC: 5000, mUSDC: 5000 },
    );
    const chainMock = {
      viewState: jest
        .fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after),
      getPrices: jest.fn().mockResolvedValue(prices),
      rebalance: jest.fn().mockResolvedValue('tx'),
    };
    const billingMock = {
      chargeRebalanceFee: jest
        .fn()
        .mockResolvedValue({ receipt: 'x402-test', feeUsd6: '0' }),
    };
    const create = jest.fn<
      Promise<unknown>,
      [{ data: { rationale: string; x402Receipt: string } }]
    >();
    create.mockResolvedValue({});
    const prismaMock = {
      rebalanceLog: { findFirst: jest.fn().mockResolvedValue(null), create },
    };
    const keeper = new KeeperService(
      prismaMock as unknown as PrismaService,
      chainMock as unknown as ChainService,
      undefined as unknown as PricingService,
      billingMock as unknown as BillingService,
      new AgentService(), // real agent, no key → deterministic rationale fallback
    );

    const res = await keeper.triggerRebalance('v', { force: true });

    expect(res.executed).toBe(true);
    expect(chainMock.rebalance).toHaveBeenCalledWith('v');
    expect(create).toHaveBeenCalledTimes(1);
    const logged = create.mock.calls[0][0];
    expect(logged.data.rationale.length).toBeGreaterThan(0);
    expect(logged.data.x402Receipt).toBe('x402-test');
  });
});
