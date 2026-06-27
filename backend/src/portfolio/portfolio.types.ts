/**
 * Response shapes the portfolio API returns. These mirror the frontend's
 * `lib/types.ts` exactly (the frontend is display-only; the backend is the
 * source of these values). USD amounts are raw fixed-point 6-dp strings; weights
 * are bps (Σ = 10000).
 */
import type { Profile } from '../config/constants';

export type AllocationDto = Record<string, number>;

export interface PortfolioMetaDto {
  vaultHash: string;
  owner: string;
  name: string;
  profile: Profile;
  baseAllocation: AllocationDto;
  targetAmountUsd: string;
  targetYear: number;
  createdYear: number;
  createdAt: string;
}

export interface PortfolioSummaryDto {
  meta: PortfolioMetaDto;
  totalValueUsd: string;
  /** Progress toward the goal in bps (value / target), capped at 10000. */
  progressBps: number;
}

export interface PortfolioStateDto extends PortfolioMetaDto {
  holdings: Record<string, string>;
  /** Current weights from holdings × oracle prices (bps). */
  currentAllocation: AllocationDto;
  /** Glide-path-adjusted target from the contract (`view_state`), bps. */
  currentTargetAllocation: AllocationDto;
  totalValueUsd: string;
  progressBps: number;
}

export interface StarterPortfolioDto {
  name: string;
  profile: Profile;
  allocation: AllocationDto;
  targetAmountUsd: string;
  targetYear: number;
  rationale?: string;
}

export interface SuggestAllocationResultDto {
  allocation: AllocationDto;
  rationale: string;
}

export interface SwapLegDto {
  asset: string;
  /** Signed delta in USD (6 dp): negative = sold, positive = bought. */
  deltaUsd: string;
}

export interface RebalanceLogEntryDto {
  id: string;
  vaultHash: string;
  timestamp: string;
  preWeights: AllocationDto;
  postWeights: AllocationDto;
  swaps: SwapLegDto[];
  rationale: string;
  x402Receipt?: string;
}

export interface ChatMessageDto {
  id: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
}
