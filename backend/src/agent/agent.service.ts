import { Injectable, Logger } from '@nestjs/common';
import type { Profile } from '../config/constants';

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
  private readonly model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

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

  /** Classify a user into a risk bucket. Returns a bucket + reasoning only. */
  async profileRisk(
    answers: Record<string, unknown>[],
    demographics: Record<string, unknown>,
  ): Promise<{ profile: Profile; reasoning: string; score?: number }> {
    // TODO: prompt the model to classify, then parse the reply into a Profile.
    // The bucket then drives purely deterministic logic elsewhere.
    this.logger.debug(
      `profileRisk: ${answers.length} answers, demographics keys=${Object.keys(demographics).length}`,
    );
    throw new Error('AgentService.profileRisk: not implemented');
  }

  /** Suggest an allocation (bps) for a goal. The result is USER-EDITABLE. */
  async suggestAllocation(
    profile: Profile,
    goal: { targetAmountUsd: string; targetYear: number; note?: string },
  ): Promise<{ allocation: Record<string, number>; rationale: string }> {
    // TODO: prompt for an allocation suggestion; the stored (edited) value is
    // what actually executes — never pipe this straight into a swap.
    this.logger.debug(`suggestAllocation: ${profile} -> ${goal.targetYear}`);
    throw new Error('AgentService.suggestAllocation: not implemented');
  }

  /** Write a natural-language rationale for a rebalance (display only). */
  async explainRebalance(input: {
    preWeights: Record<string, number>;
    postWeights: Record<string, number>;
    swaps: { asset: string; deltaUsd: string }[];
  }): Promise<string> {
    return this.complete([
      {
        role: 'system',
        content:
          'You explain portfolio rebalances to a non-expert in 2-3 sentences. ' +
          'Describe what changed and why; do not invent numbers beyond those given.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ]);
  }

  /** Answer a question about a portfolio (display only). */
  async answer(snapshot: unknown, question: string): Promise<string> {
    return this.complete([
      {
        role: 'system',
        content:
          'You answer questions about the user’s portfolio using only the ' +
          'provided snapshot. Be concise and never give financial guarantees.',
      },
      { role: 'user', content: `Snapshot: ${JSON.stringify(snapshot)}\n\nQ: ${question}` },
    ]);
  }
}
