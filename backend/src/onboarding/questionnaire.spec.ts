import { QUESTIONNAIRE, QUESTIONNAIRE_VERSION } from './questionnaire';

describe('questionnaire', () => {
  it('is versioned and non-empty', () => {
    expect(QUESTIONNAIRE.version).toBe(QUESTIONNAIRE_VERSION);
    expect(QUESTIONNAIRE.questions.length).toBeGreaterThan(0);
  });

  it('has unique question ids', () => {
    const ids = QUESTIONNAIRE.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 🔴 The agent's deterministic fallback reads `horizon` numerically
  // (agent.parse.heuristicProfile) — it MUST stay a number question.
  it('keeps `horizon` as a numeric question (agent contract)', () => {
    const horizon = QUESTIONNAIRE.questions.find((q) => q.id === 'horizon');
    expect(horizon).toBeDefined();
    expect(horizon?.kind).toBe('number');
  });

  it('gives every choice question a non-empty options list', () => {
    for (const q of QUESTIONNAIRE.questions) {
      if (q.kind === 'choice') {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(q.options).toBeUndefined();
      }
    }
  });

  it('keeps numeric bounds coherent when present', () => {
    for (const q of QUESTIONNAIRE.questions) {
      if (typeof q.min === 'number' && typeof q.max === 'number') {
        expect(q.min).toBeLessThanOrEqual(q.max);
      }
    }
  });
});
