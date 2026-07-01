/**
 * The versioned onboarding questionnaire — the SINGLE source of truth for the risk
 * questions the frontend renders. Bump `QUESTIONNAIRE_VERSION` when the set or any
 * `id` changes so clients can detect drift.
 *
 * 🔴 `horizon` MUST stay a numeric question: the agent reads it numerically
 * (`agent.parse.heuristicProfile` → `numericAnswer(answers, 'horizon')`) for the
 * deterministic profile fallback. The other answers are free context for the LLM.
 */

export const QUESTIONNAIRE_VERSION = 'v1';

export type QuestionKind = 'number' | 'text' | 'choice';

export interface QuestionDto {
  /** Stable id echoed back in `POST /onboarding/answers` (agent keys off these). */
  id: string;
  label: string;
  kind: QuestionKind;
  /** For `choice`: the selectable option values (also what gets submitted). */
  options?: string[];
  placeholder?: string;
  /** For `number`: inclusive display bounds (the agent still re-derives the value). */
  min?: number;
  max?: number;
}

export interface QuestionnaireDto {
  version: string;
  questions: QuestionDto[];
}

export const QUESTIONNAIRE: QuestionnaireDto = {
  version: QUESTIONNAIRE_VERSION,
  questions: [
    {
      id: 'horizon',
      label: 'How many years until you need this money?',
      kind: 'number',
      min: 0,
      max: 100,
      placeholder: '10',
    },
    {
      id: 'drawdown',
      label: 'How would you react to a 20% drop in a single year?',
      kind: 'choice',
      options: [
        'Sell to avoid further losses',
        'Hold and wait for recovery',
        'Buy more at lower prices',
      ],
    },
    {
      id: 'goal',
      label: 'What is this portfolio for?',
      kind: 'text',
      placeholder: 'e.g. retirement, a house, education',
    },
  ],
};
