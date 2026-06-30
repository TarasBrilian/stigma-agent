import { AgentService } from './agent.service';

// Force the no-key path so these are deterministic and never hit the network.
describe('AgentService (no API key)', () => {
  const prev = process.env.OPENROUTER_API_KEY;
  beforeAll(() => {
    delete process.env.OPENROUTER_API_KEY;
  });
  afterAll(() => {
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
  });

  it('falls back to a deterministic profile when the LLM is unavailable', async () => {
    const res = await new AgentService().profileRisk(
      [{ questionId: 'horizon', value: 20 }],
      { age: 30 },
    );
    expect(res.profile).toBe('Aggressive');
  });

  it('throws on suggestAllocation so the caller can fall back', async () => {
    await expect(
      new AgentService().suggestAllocation('Moderate', {
        targetAmountUsd: '1',
        targetYear: 2040,
      }),
    ).rejects.toThrow();
  });

  it('explainRebalance falls back to a deterministic rationale (no LLM)', async () => {
    const res = await new AgentService().explainRebalance({
      preWeights: { mUSDC: 5000, mBTC: 5000 },
      postWeights: { mUSDC: 3000, mBTC: 7000 }, // mBTC +20%, mUSDC -20%
      swaps: [],
    });
    expect(res).toContain('mBTC');
    expect(res).toContain('20.0%');
  });

  it('answer degrades gracefully instead of throwing (no LLM)', async () => {
    const res = await new AgentService().answer(
      { name: 'x' },
      'how am I doing?',
    );
    expect(res.length).toBeGreaterThan(0);
    expect(res).toMatch(/unavailable/i);
  });
});
