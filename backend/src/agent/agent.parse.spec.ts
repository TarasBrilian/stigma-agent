import {
  deterministicRationale,
  extractJson,
  heuristicProfile,
  parseAllocationReply,
  parseProfileReply,
} from './agent.parse';

describe('agent.parse', () => {
  describe('extractJson', () => {
    it('parses fenced JSON surrounded by prose', () => {
      expect(extractJson('Sure!\n```json\n{"a":1}\n```\nDone')).toEqual({
        a: 1,
      });
    });

    it('returns null on non-JSON', () => {
      expect(extractJson('no json here')).toBeNull();
    });
  });

  describe('parseProfileReply', () => {
    it('accepts a known bucket', () => {
      expect(
        parseProfileReply('{"profile":"Moderate","reasoning":"ok","score":55}'),
      ).toEqual({ profile: 'Moderate', reasoning: 'ok', score: 55 });
    });

    it('rejects an unknown bucket', () => {
      expect(parseProfileReply('{"profile":"YOLO"}')).toBeNull();
    });
  });

  describe('parseAllocationReply', () => {
    it('keeps numeric weights and the rationale', () => {
      expect(
        parseAllocationReply(
          '{"allocation":{"mBTC":6000,"mUSDC":4000},"rationale":"r"}',
        ),
      ).toEqual({ allocation: { mBTC: 6000, mUSDC: 4000 }, rationale: 'r' });
    });

    it('returns null without an allocation object', () => {
      expect(parseAllocationReply('{"rationale":"r"}')).toBeNull();
    });
  });

  describe('heuristicProfile', () => {
    it('maps horizon length to a bucket', () => {
      expect(
        heuristicProfile([{ questionId: 'horizon', value: 20 }]).profile,
      ).toBe('Aggressive');
      expect(
        heuristicProfile([{ questionId: 'horizon', value: 10 }]).profile,
      ).toBe('Moderate');
      expect(
        heuristicProfile([{ questionId: 'horizon', value: 2 }]).profile,
      ).toBe('Conservative');
    });

    it('defaults to Conservative when the horizon is missing', () => {
      expect(heuristicProfile([]).profile).toBe('Conservative');
    });
  });

  describe('deterministicRationale', () => {
    it('describes the biggest weight moves, largest first', () => {
      const r = deterministicRationale(
        { mUSDC: 5000, mBTC: 3000, mXAUT: 2000 },
        { mUSDC: 2000, mBTC: 3000, mXAUT: 5000 }, // mUSDC -30%, mXAUT +30%
      );
      expect(r).toMatch(/mUSDC -30\.0%|mXAUT \+30\.0%/);
      expect(r).toContain('mXAUT +30.0%');
      expect(r).toContain('mUSDC -30.0%');
      expect(r).not.toContain('mBTC'); // unchanged
    });

    it('reports "on target" when moves are dust (< 0.1%)', () => {
      const r = deterministicRationale({ mBTC: 2000 }, { mBTC: 2001 });
      expect(r).toMatch(/on target/i);
    });
  });
});
