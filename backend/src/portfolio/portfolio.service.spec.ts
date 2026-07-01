import { Prisma } from '@prisma/client';
import { PortfolioService } from './portfolio.service';
import { AgentService } from '../agent/agent.service';
import { ChainService } from '../chain/chain.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { allocationSumBps, isValidAllocation } from '../config/money';

// Shared fixtures — one definition reused across the describe blocks below.
const OWNER_ROW = { id: 'u1', walletAddress: 'owner-pk' };
const ALLOC = {
  mUSDC: 0,
  mBTC: 2000,
  mNVDAx: 3000,
  mXAUT: 4000,
  mGOOGLx: 1000,
};
const META_ROW = {
  vaultHash: 'hash-v',
  name: 'My Goal',
  profile: 'Moderate' as const,
  baseAllocation: ALLOC,
  targetAmountUsd: new Prisma.Decimal('1000'),
  targetYear: 2040,
  createdYear: 2026, // DB mirror
  createdAt: new Date('2026-06-30T00:00:00Z'),
  user: OWNER_ROW,
};

/** Build the service with only the collaborators a test needs (rest unused). */
const makeService = (mocks: {
  prisma?: unknown;
  chain?: unknown;
  pricing?: unknown;
  agent?: unknown;
}): PortfolioService =>
  new PortfolioService(
    mocks.prisma as PrismaService,
    mocks.chain as ChainService,
    mocks.pricing as PricingService,
    mocks.agent as AgentService,
  );

describe('PortfolioService (no-chain paths)', () => {
  const agentMock = { suggestAllocation: jest.fn() };
  const make = (): PortfolioService => makeService({ agent: agentMock });

  beforeEach(() => agentMock.suggestAllocation.mockReset());

  describe('generateStarters', () => {
    it('returns valid Σ=10000 starters for the profile', () => {
      const starters = make().generateStarters('Moderate');
      expect(starters).toHaveLength(3);
      for (const s of starters) {
        expect(s.profile).toBe('Moderate');
        expect(allocationSumBps(s.allocation)).toBe(10000);
        expect(s.targetYear).toBeGreaterThan(new Date().getFullYear());
      }
    });
  });

  describe('suggest', () => {
    const goal = {
      profile: 'Aggressive' as const,
      targetAmountUsd: '1',
      targetYear: 2040,
    };

    it('returns the agent suggestion when valid', async () => {
      agentMock.suggestAllocation.mockResolvedValue({
        allocation: { mBTC: 6000, mUSDC: 4000 },
        rationale: 'ok',
      });
      const res = await make().suggest(goal);
      expect(res.allocation).toEqual({ mBTC: 6000, mUSDC: 4000 });
    });

    it('falls back to a valid preset when the agent fails', async () => {
      agentMock.suggestAllocation.mockRejectedValue(new Error('no key'));
      const res = await make().suggest(goal);
      expect(isValidAllocation(res.allocation)).toBe(true);
      expect(res.rationale).toContain('preset');
    });

    it('falls back when the agent returns an invalid allocation', async () => {
      agentMock.suggestAllocation.mockResolvedValue({
        allocation: { mBTC: 1234 },
        rationale: 'bad',
      });
      const res = await make().suggest(goal);
      expect(isValidAllocation(res.allocation)).toBe(true);
    });
  });
});

describe('PortfolioService.register (chain wiring)', () => {
  const chainMock = { register: jest.fn() };
  const prismaMock = {
    user: { upsert: jest.fn().mockResolvedValue(OWNER_ROW) },
    portfolioMeta: { create: jest.fn().mockResolvedValue(META_ROW) },
  };
  const make = (): PortfolioService =>
    makeService({ prisma: prismaMock, chain: chainMock });
  const dto = {
    vaultHash: 'hash-v',
    owner: 'account-hash-aa',
    name: 'My Goal',
    profile: 'Moderate' as const,
    baseAllocation: ALLOC,
    targetAmountUsd: '1000000000',
    targetYear: 2040,
  };

  beforeEach(() => {
    chainMock.register.mockReset().mockResolvedValue('tx');
    prismaMock.portfolioMeta.create.mockClear();
  });

  it('registers on-chain, then mirrors', async () => {
    const res = await make().register(dto);
    expect(chainMock.register).toHaveBeenCalledWith(
      'account-hash-aa',
      'hash-v',
    );
    expect(prismaMock.portfolioMeta.create).toHaveBeenCalledTimes(1);
    expect(res.vaultHash).toBe('hash-v');
    expect(res.owner).toBe('owner-pk');
  });

  it('still mirrors if the on-chain register fails (best-effort)', async () => {
    chainMock.register.mockRejectedValue(new Error('no key'));
    const res = await make().register(dto);
    expect(prismaMock.portfolioMeta.create).toHaveBeenCalledTimes(1);
    expect(res.vaultHash).toBe('hash-v');
  });

  it('rejects an invalid allocation before touching the chain', async () => {
    await expect(
      make().register({ ...dto, baseAllocation: { mBTC: 1 } }),
    ).rejects.toThrow();
    expect(chainMock.register).not.toHaveBeenCalled();
  });
});

describe('PortfolioService.get (surfaces on-chain createdYear — golden rule #5)', () => {
  const chainState = {
    owner: 'account-hash-aa',
    agent: 'account-hash-bb',
    profile: 'Moderate' as const,
    baseAllocation: ALLOC,
    currentTargetAllocation: ALLOC,
    holdings: {
      mUSDC: '1000000',
      mBTC: '0',
      mNVDAx: '0',
      mXAUT: '0',
      mGOOGLx: '0',
    },
    targetAmountUsd: '1000000000',
    targetYear: 2040,
    createdYear: 2019, // on-chain truth (differs from META_ROW's 2026 DB mirror)
  };
  const prices = {
    mUSDC: 1_000_000n,
    mBTC: 0n,
    mNVDAx: 0n,
    mXAUT: 0n,
    mGOOGLx: 0n,
  };
  const chainMock = {
    viewState: jest.fn().mockResolvedValue(chainState),
    getPrices: jest.fn().mockResolvedValue(prices),
  };
  const prismaMock = {
    portfolioMeta: { findUnique: jest.fn().mockResolvedValue(META_ROW) },
  };
  const make = (): PortfolioService =>
    makeService({ prisma: prismaMock, chain: chainMock });

  it('returns createdYear from view_state, not the DB mirror', async () => {
    const res = await make().get('hash-v');
    expect(res.createdYear).toBe(2019);
    expect(chainMock.viewState).toHaveBeenCalledWith('hash-v');
  });
});
