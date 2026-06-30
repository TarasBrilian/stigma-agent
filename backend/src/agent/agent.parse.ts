/**
 * Pure parsing + a deterministic fallback for the agent's LLM replies. No network
 * and no framework, so this is fully unit-testable. The model is asked for strict
 * JSON; these helpers tolerate code fences / extra prose, and the heuristic yields
 * a usable bucket when the model is unavailable or unparseable.
 *
 * Boundary note: validating an allocation's Σ=10000 belongs to the caller
 * (PortfolioService), not here — this module only shapes the reply.
 */
import { PROFILES, type Profile } from '../config/constants';

/** A single questionnaire answer as submitted by the client. */
export interface RiskAnswer {
  questionId: string;
  value: unknown;
}

function isProfile(v: unknown): v is Profile {
  return typeof v === 'string' && (PROFILES as string[]).includes(v);
}

/** Pull the first {...} JSON object out of a model reply (tolerates ``` fences). */
export function extractJson(content: string): Record<string, unknown> | null {
  const stripped = content.replace(/```/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface ProfileReply {
  profile: Profile;
  reasoning: string;
  score?: number;
}

export function parseProfileReply(content: string): ProfileReply | null {
  const obj = extractJson(content);
  if (!obj || !isProfile(obj.profile)) return null;
  return {
    profile: obj.profile,
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    score: typeof obj.score === 'number' ? obj.score : undefined,
  };
}

export interface AllocationReply {
  allocation: Record<string, number>;
  rationale: string;
}

export function parseAllocationReply(content: string): AllocationReply | null {
  const obj = extractJson(content);
  if (!obj || typeof obj.allocation !== 'object' || obj.allocation === null) {
    return null;
  }
  const allocation: Record<string, number> = {};
  for (const [k, v] of Object.entries(
    obj.allocation as Record<string, unknown>,
  )) {
    if (typeof v === 'number') allocation[k] = v;
  }
  return {
    allocation,
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
  };
}

/** Read a numeric questionnaire answer (e.g. the horizon in years). */
function numericAnswer(answers: RiskAnswer[], id: string): number {
  for (const a of answers) {
    if (a && a.questionId === id) {
      const v = a.value;
      if (typeof v === 'number') return v;
      if (
        typeof v === 'string' &&
        v.trim() !== '' &&
        Number.isFinite(Number(v))
      ) {
        return Number(v);
      }
    }
  }
  return 0;
}

/**
 * Deterministic risk bucket from the answers — the fallback when the LLM is
 * unavailable. Uses the investment horizon (longer = more risk-tolerant).
 */
export function heuristicProfile(answers: RiskAnswer[]): ProfileReply {
  const horizon = numericAnswer(answers, 'horizon');
  let profile: Profile;
  let score: number;
  if (horizon >= 15) {
    profile = 'Aggressive';
    score = 80;
  } else if (horizon >= 7) {
    profile = 'Moderate';
    score = 55;
  } else {
    profile = 'Conservative';
    score = 30;
  }
  return {
    profile,
    reasoning: `Assigned ${profile} from a ${horizon || 'short'}-year horizon (deterministic fallback).`,
    score,
  };
}

/**
 * Deterministic, display-only rebalance rationale from the pre/post target weights
 * (bps) — the fallback when the LLM is unavailable. It only describes the given
 * weight changes (golden rule #1: it invents no executed numbers). Moves under
 * 0.1% are treated as dust.
 */
export function deterministicRationale(
  preWeights: Record<string, number>,
  postWeights: Record<string, number>,
): string {
  const assets = new Set([
    ...Object.keys(preWeights),
    ...Object.keys(postWeights),
  ]);
  const moves = [...assets]
    .map((asset) => ({
      asset,
      deltaBps: (postWeights[asset] ?? 0) - (preWeights[asset] ?? 0),
    }))
    .filter((m) => Math.abs(m.deltaBps) >= 10)
    .sort((a, b) => Math.abs(b.deltaBps) - Math.abs(a.deltaBps));

  if (moves.length === 0) {
    return 'Rebalanced to the target allocation; the portfolio was already on target, so only minor adjustments were made.';
  }
  const parts = moves.map((m) => {
    const sign = m.deltaBps > 0 ? '+' : '-';
    return `${m.asset} ${sign}${(Math.abs(m.deltaBps) / 100).toFixed(1)}%`;
  });
  return `Rebalanced toward the target allocation — adjusted ${parts.join(', ')}.`;
}
