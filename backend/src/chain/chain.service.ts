import { Injectable, Logger } from '@nestjs/common';
import type { AssetSymbol } from '../config/constants';

/** What the contract's `view_state` returns (merged shape the app consumes). */
export interface VaultState {
  owner: string;
  agent: string;
  profile: 'Conservative' | 'Moderate' | 'Aggressive';
  /** Growth-tilted start allocation (bps, Σ = 10000). */
  baseAllocation: Record<string, number>;
  /** Glide-path-adjusted target computed ON-CHAIN (bps). Never re-derived here. */
  currentTargetAllocation: Record<string, number>;
  /** Raw token balances held by the vault. */
  holdings: Record<string, string>;
  targetAmountUsd: string; // raw 6 dp
  targetYear: number;
  createdYear: number;
}

/**
 * The ONLY module that talks to Casper (golden rule #2). It builds/sends
 * deploys, reads vault/oracle state, and holds the AGENT HOT KEY.
 *
 * 🔴 The agent key may ONLY trigger `execute_buy` / `rebalance` (enforced
 * on-chain). NEVER add a method that constructs a withdraw or any fund-moving
 * deploy with the agent key (golden rule #4). Never log or return the key.
 *
 * TODO: import casper-js-sdk HERE exclusively (RpcClient + HttpHandler), load
 * the key from AGENT_SECRET_KEY_PATH, and wire the contract hashes from env.
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  private readonly nodeUrl = process.env.CASPER_NODE_URL ?? '';
  private readonly network = process.env.CASPER_NETWORK_NAME ?? 'casper-test';

  /** Read holdings + the contract's computed glide target + config. */
  viewState(vaultHash: string): Promise<VaultState> {
    return this.notImplemented('viewState', vaultHash);
  }

  /** Current oracle prices per asset (raw USD, 6 dp). */
  getPrices(): Promise<Record<AssetSymbol, bigint>> {
    return this.notImplemented('getPrices');
  }

  /** Keeper writes a reference price to the mock oracle. */
  setPrice(token: AssetSymbol, priceUsd6: bigint): Promise<void> {
    return this.notImplemented('setPrice', `${token}=${priceUsd6}`);
  }

  /** Agent triggers a buy; the vault derives amounts in-contract (no amounts here). */
  executeBuy(vaultHash: string): Promise<void> {
    return this.notImplemented('executeBuy', vaultHash);
  }

  /** Agent triggers a rebalance back to the exact computed target (slippage-capped). */
  rebalance(vaultHash: string): Promise<void> {
    return this.notImplemented('rebalance', vaultHash);
  }

  /** Demo: mint test mUSDC to an owner via the token faucet. */
  faucetMint(owner: string, amountUsd6: bigint): Promise<void> {
    return this.notImplemented('faucetMint', `${owner}:${amountUsd6}`);
  }

  private notImplemented(method: string, detail?: string): never {
    this.logger.warn(
      `ChainService.${method}(${detail ?? ''}) not implemented (network=${this.network}, node=${this.nodeUrl || 'unset'})`,
    );
    throw new Error(`ChainService.${method}: not implemented`);
  }
}
