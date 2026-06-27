/**
 * Typed client for the backend REST API.
 *
 * All portfolio reads (value, target allocation, projection, activity, chat)
 * come from here — the backend merges live on-chain state with its off-chain
 * mirror. The frontend never queries Casper directly for these (golden rule).
 *
 * Safe to import from both Server and Client Components (uses `fetch` only).
 */

import { env } from "./constants";
import type {
  ChatMessage,
  OnboardingResult,
  OnboardingSubmission,
  PortfolioState,
  PortfolioSummary,
  Profile,
  Projection,
  RebalanceLogEntry,
  StarterPortfolio,
  SuggestAllocationResult,
  Usd6,
} from "./types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...rest,
    // Portfolio state is live; never serve a stale cached read.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  /* onboarding */
  submitOnboarding: (payload: OnboardingSubmission) =>
    request<OnboardingResult>("/onboarding/answers", { method: "POST", json: payload }),

  /* portfolios */
  listPortfolios: (owner: string) =>
    request<PortfolioSummary[]>(`/portfolios?owner=${encodeURIComponent(owner)}`),

  getPortfolio: (vaultHash: string) =>
    request<PortfolioState>(`/portfolios/${encodeURIComponent(vaultHash)}`),

  generateStarters: (profile: Profile) =>
    request<StarterPortfolio[]>("/portfolios/starter", {
      method: "POST",
      json: { profile },
    }),

  suggestAllocation: (goal: {
    profile: Profile;
    targetAmountUsd: Usd6;
    targetYear: number;
    note?: string;
  }) =>
    request<SuggestAllocationResult>("/portfolios/suggest", {
      method: "POST",
      json: goal,
    }),

  getProjection: (vaultHash: string) =>
    request<Projection>(`/portfolios/${encodeURIComponent(vaultHash)}/projection`),

  getActivity: (vaultHash: string) =>
    request<RebalanceLogEntry[]>(`/portfolios/${encodeURIComponent(vaultHash)}/activity`),

  /* agent chat */
  chat: (vaultHash: string, message: string) =>
    request<ChatMessage>("/agent/chat", {
      method: "POST",
      json: { vaultHash, message },
    }),

  /* demo controls (testnet) — keep these working (golden rule: demo-ready) */
  demoSetPrice: (token: string, price: Usd6) =>
    request<void>("/keeper/oracle/override", { method: "POST", json: { token, price } }),

  demoRebalanceNow: (vaultHash: string) =>
    request<void>(`/keeper/rebalance/${encodeURIComponent(vaultHash)}`, { method: "POST" }),

  demoFaucet: (owner: string, amount: Usd6) =>
    request<void>("/faucet/musdc", { method: "POST", json: { owner, amount } }),
};

export { ApiError };
