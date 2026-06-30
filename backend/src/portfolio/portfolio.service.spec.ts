import { Prisma } from '@prisma/client';
import { PortfolioService } from './portfolio.service';
import { AgentService } from '../agent/agent.service';
import { ChainService } from '../chain/chain.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { allocationSumBps, isValidAllocation } from '../config/money';

describe('PortfolioService (no-chain paths)', () => {
  const agentMock = { suggestAllocation: jest.fn() };

  const make = (): PortfolioService =>
    new PortfolioService(
      undefined as unknown as PrismaService,
      undefined as unknown as ChainService,
      undefined as unknown as PricingService,
      agentMock as unknown as AgentService,
    );

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
  const userRow = { id: 'u1', walletAddress: 'owner-pk' };
  const metaRow = {
    vaultHash: 'hash-v',
    name: 'My Goal',
    profile: 'Moderate' as const,
    baseAllocation: {
      mUSDC: 0,
      mBTC: 2000,
      mNVDAx: 3000,
      mXAUT: 4000,
      mGOOGLx: 1000,
    },
    targetAmountUsd: new Prisma.Decimal('1000'),
    targetYear: 2040,
    createdYear: 2026,
    createdAt: new Date('2026-06-30T00:00:00Z'),
    user: userRow,
  };
  const prismaMock = {
    user: { upsert: jest.fn().mockResolvedValue(userRow) },
    portfolioMeta: { create: jest.fn().mockResolvedValue(metaRow) },
  };
  const make = (): PortfolioService =>
    new PortfolioService(
      prismaMock as unknown as PrismaService,
      chainMock as unknown as ChainService,
      undefined as unknown as PricingService,
      undefined as unknown as AgentService,
    );
  const dto = {
    vaultHash: 'hash-v',
    owner: 'account-hash-aa',
    name: 'My Goal',
    profile: 'Moderate' as const,
    baseAllocation: {
      mUSDC: 0,
      mBTC: 2000,
      mNVDAx: 3000,
      mXAUT: 4000,
      mGOOGLx: 1000,
    },
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
