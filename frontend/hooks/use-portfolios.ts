"use client";

/**
 * React Query hooks over the backend REST API (lib/api.ts). These power the
 * interactive (client) parts of the UI; Server Components can also call
 * `api.*` directly for first render.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.chat(vaultHash, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", vaultHash] }),
  });
}
