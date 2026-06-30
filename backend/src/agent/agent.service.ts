import { Injectable, Logger } from '@nestjs/common';
import type { Profile } from '../config/constants';
import {
  deterministicRationale,
  heuristicProfile,
  parseAllocationReply,
  parseProfileReply,
  type AllocationReply,
  type ProfileReply,
  type RiskAnswer,
} from './agent.parse';

/** Graceful, display-only reply when the Q&A LLM is unavailable. */
const ANSWER_UNAVAILABLE =
  'The assistant is unavailable right now, so I can’t answer that — your ' +
  'portfolio’s value, allocation, and goal are shown on the dashboard.';

interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * The ONLY module that calls OpenRouter (golden rule #3). It is used for
 * judgment, suggestion, and explanation — NEVER for executed numbers
 * (golden rule #1):
 *   - profiling returns a BUCKET (deterministic logic follows),
 *   - suggested allocation is USER-EDITABLE (the stored value executes),
 *   - rationale / answers are display-only.
 * No money math lives here; no chain logic lives here.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly apiKey = process.env.OPENROUTER_API_KEY ?? '';
  private readonly model =
    process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free';

  /** Low-level chat completion against OpenRouter. */
  private async complete(messages: ChatMsg[]): Promise<string> {
    if (!this.apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages }),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Classify a user into a risk bucket. Returns a bucket + reasoning only — the
   * bucket then drives purely deterministic logic elsewhere (golden rule #1). If
   * the model is unavailable or its reply is unparseable, falls back to a
   * deterministic heuristic so onboarding still works without a key.
   */
  async profileRisk(
    answers: RiskAnswer[],
    demographics: Record<string, unknown>,
  ): Promise<ProfileReply> {
    try {
      const reply = await this.complete([
        {
          role: 'system',
          content:
            'You are a risk-profiling assistant. Classify the user into exactly ' +
            'one bucket. Respond ONLY with JSON: ' +
            '{"profile":"Conservative|Moderate|Aggressive","reasoning":"...",' +
            '"score":0-100} where a higher score is more risk-tolerant.',
        },
        { role: 'user', content: JSON.stringify({ answers, demographics }) },
      ]);
      const parsed = parseProfileReply(reply);
      if (parsed) return parsed;
      this.logger.warn('profileRisk: unparseable reply; using heuristic');
    } catch (err) {
      this.logger.warn(
        `profileRisk: LLM unavailable; using heuristic: ${(err as Error).message}`,
      );
    }
    return heuristicProfile(answers);
  }

  /**
   * Suggest an allocation (bps) for a goal. The result is USER-EDITABLE and is
   * validated by the caller; this throws on failure so the caller can fall back
   * to a preset (golden rule #1 — never pipe this straight into a swap).
   */
  async suggestAllocation(
    profile: Profile,
    goal: { targetAmountUsd: string; targetYear: number; note?: string },
  ): Promise<AllocationReply> {
    const reply = await this.complete([
      {
        role: 'system',
        content:
          'You suggest a starter asset allocation in basis points (integers ' +
          'summing to 10000) across these assets only: mUSDC, mBTC, mNVDAx, ' +
          'mXAUT, mGOOGLx. Respond ONLY with JSON: ' +
          '{"allocation":{"mBTC":4000,...},"rationale":"..."}.',
      },
      { role: 'user', content: JSON.stringify({ profile, goal }) },
    ]);
    const parsed = parseAllocationReply(reply);
    if (!parsed) {
      throw new Error('AgentService.suggestAllocation: unparseable reply');
    }
    return parsed;
  }

  /**
   * Write a natural-language rationale for a rebalance (display only). Falls back
   * to a deterministic summary of the pre/post weight deltas if the LLM is
   * unavailable or returns nothing, so the keeper can always persist a rationale
   * (golden rule #1: display-only, never an executed number).
   */
  async explainRebalance(input: {
    preWeights: Record<string, number>;
    postWeights: Record<string, number>;
    swaps: { asset: string; deltaUsd: string }[];
  }): Promise<string> {
    try {
      const reply = (
        await this.complete([
          {
            role: 'system',
            content:
              'You explain portfolio rebalances to a non-expert in 2-3 sentences. ' +
              'Describe what changed and why; do not invent numbers beyond those given.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ])
      ).trim();
      if (reply) return reply;
      this.logger.warn(
        'explainRebalance: empty reply; using deterministic rationale',
      );
    } catch (err) {
      this.logger.warn(
        `explainRebalance: LLM unavailable; using deterministic rationale: ${(err as Error).message}`,
      );
    }
    return deterministicRationale(input.preWeights, input.postWeights);
  }

  /**
   * Answer a question about a portfolio (display only). Degrades gracefully to a
   * fixed "unavailable" reply if the LLM is unavailable or returns nothing, so
   * chat never throws.
   */
  async answer(snapshot: unknown, question: string): Promise<string> {
    try {
      const reply = (
        await this.complete([
          {
            role: 'system',
            content:
              'You answer questions about the user’s portfolio using only the ' +
              'provided snapshot. Be concise and never give financial guarantees.',
          },
          {
            role: 'user',
            content: `Snapshot: ${JSON.stringify(snapshot)}\n\nQ: ${question}`,
          },
        ])
      ).trim();
      if (reply) return reply;
      this.logger.warn('answer: empty reply; using fallback');
    } catch (err) {
      this.logger.warn(
        `answer: LLM unavailable; using fallback: ${(err as Error).message}`,
      );
    }
    return ANSWER_UNAVAILABLE;
  }
}
