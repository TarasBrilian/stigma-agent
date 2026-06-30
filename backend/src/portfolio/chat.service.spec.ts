import { Prisma } from '@prisma/client';
import { ChatService } from './chat.service';
import { ChainService, type VaultState } from '../chain/chain.service';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';

const meta = {
  id: 'm1',
  vaultHash: 'hash-v',
  userId: 'u1',
  name: 'My Goal',
  profile: 'Moderate',
  baseAllocation: { mBTC: 2000 },
  targetAmountUsd: new Prisma.Decimal('1000'),
  targetYear: 2040,
  createdYear: 2026,
  createdAt: new Date('2026-06-30T00:00:00Z'),
};

const prices = {
  mUSDC: 1_000_000n,
  mBTC: 65_000_000_000n,
  mNVDAx: 100_000_000n,
  mXAUT: 2_000_000_000n,
  mGOOGLx: 150_000_000n,
};

const state: VaultState = {
  owner: 'o',
  agent: 'a',
  profile: 'Moderate',
  baseAllocation: {},
  currentTargetAllocation: { mBTC: 2000, mUSDC: 8000 },
  holdings: { mUSDC: '0', mBTC: '153' }, // ~$10 in mBTC
  targetAmountUsd: '1000000000',
  targetYear: 2040,
  createdYear: 2026,
};

describe('ChatService', () => {
  let agentMock: { answer: jest.Mock<Promise<string>, [unknown, string]> };
  let chainMock: { viewState: jest.Mock; getPrices: jest.Mock };
  let prismaMock: {
    portfolioMeta: { findUnique: jest.Mock };
    chatMessage: { create: jest.Mock };
  };
  let chat: ChatService;

  beforeEach(() => {
    agentMock = {
      answer: jest
        .fn<Promise<string>, [unknown, string]>()
        .mockResolvedValue('the answer'),
    };
    chainMock = {
      viewState: jest.fn().mockResolvedValue(state),
      getPrices: jest.fn().mockResolvedValue(prices),
    };
    prismaMock = {
      portfolioMeta: { findUnique: jest.fn().mockResolvedValue(meta) },
      chatMessage: {
        create: jest
          .fn()
          .mockResolvedValueOnce({}) // the persisted user message
          .mockResolvedValueOnce({
            id: 'c1',
            content: 'the answer',
            createdAt: new Date('2026-06-30T00:00:00Z'),
          }), // the persisted agent message
      },
    };
    chat = new ChatService(
      prismaMock as unknown as PrismaService,
      chainMock as unknown as ChainService,
      agentMock as unknown as AgentService,
    );
  });

  const snapshotArg = (): Record<string, unknown> =>
    agentMock.answer.mock.calls[0][0] as Record<string, unknown>;

  it('enriches the snapshot with live on-chain state (human-readable units)', async () => {
    const res = await chat.ask('hash-v', 'how am I doing?');
    expect(res.content).toBe('the answer');
    expect(prismaMock.chatMessage.create).toHaveBeenCalledTimes(2); // user + agent
    const snap = snapshotArg();
    // $-dollars and %, not raw 6dp / bps:
    expect(typeof snap.currentValueUsd).toBe('number');
    expect(snap).toHaveProperty('currentAllocationPct');
    expect(snap).toHaveProperty('targetAllocationPct');
    const target = snap.targetAllocationPct as Record<string, number>;
    expect(target.mBTC).toBe(20); // 2000 bps → 20%
    expect(snap.name).toBe('My Goal');
  });

  it('degrades to the mirror snapshot when live state is unavailable', async () => {
    chainMock.viewState.mockRejectedValue(new Error('node down'));
    const res = await chat.ask('hash-v', 'q');
    expect(res.content).toBe('the answer'); // still answers
    const snap = snapshotArg();
    expect(snap).not.toHaveProperty('currentValueUsd'); // mirror only
    expect(snap.name).toBe('My Goal');
  });

  it('throws NotFound for an unknown vault', async () => {
    prismaMock.portfolioMeta.findUnique.mockResolvedValue(null);
    await expect(chat.ask('nope', 'q')).rejects.toThrow();
  });
});
