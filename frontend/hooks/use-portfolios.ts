"use client";

/**
 * React Query hooks over the backend REST API (lib/api.ts). These power the
 * interactive (client) parts of the UI; Server Components can also call
 * `api.*` directly for first render.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useQuestionnaire() {
  return useQuery({
    queryKey: ["questionnaire"],
    queryFn: () => api.getQuestionnaire(),
    // Static versioned config — no need to refetch within a session.
    staleTime: Infinity,
  });
}

export function usePortfolios(owner: string | null) {
  return useQuery({
    queryKey: ["portfolios", owner],
    queryFn: () => api.listPortfolios(owner as string),
    enabled: !!owner,
  });
}

export function usePortfolio(vaultHash: string) {
  return useQuery({
    queryKey: ["portfolio", vaultHash],
    queryFn: () => api.getPortfolio(vaultHash),
    enabled: !!vaultHash,
  });
}

export function useProjection(vaultHash: string) {
  return useQuery({
    queryKey: ["projection", vaultHash],
    queryFn: () => api.getProjection(vaultHash),
    enabled: !!vaultHash,
  });
}

export function useActivity(vaultHash: string) {
  return useQuery({
    queryKey: ["activity", vaultHash],
    queryFn: () => api.getActivity(vaultHash),
    enabled: !!vaultHash,
  });
}

export function useChat(vaultHash: string) {
  // Chat is local component state (see AgentChat), not a cached query — the
  // mutation just relays the message to the backend and returns the reply.
  return useMutation({
    mutationFn: (message: string) => api.chat(vaultHash, message),
  });
}
