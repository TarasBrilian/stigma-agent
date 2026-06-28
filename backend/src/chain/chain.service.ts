import { Injectable, Logger } from '@nestjs/common';
import {
  HttpHandler,
  ParamDictionaryIdentifier,
  ParamDictionaryIdentifierContractNamedKey,
  RpcClient,
} from 'casper-js-sdk';
import { ASSET_SYMBOLS, type AssetSymbol } from '../config/constants';
import { loadCasperConfig, requireValue } from './casper.config';
import {
  STATE_DICT,
  cep18ItemKey,
  contractKeyBytes,
  decodeAddress,
  decodeProfile,
  decodeU256,
  decodeU32,
  decodeVecU32,
  mappingItemKey,
  unwrapStateBytes,
  varItemKey,
} from './odra.codec';
import {
  END_ALLOCATION,
  currentYear,
  glideTarget,
  vectorToAllocation,
} from './glide';

/** What the contract's `view_state` returns (merged shape the app consumes). */
export interface VaultState {
  owner: string;
  agent: string;
  profile: 'Conservative' | 'Moderate' | 'Aggressive';
  /** Growth-tilted start allocation (bps, Σ = 10000). */
  baseAllocation: Record<string, number>;
  /** Glide-path-adjusted target. Computed on-chain; recomputed here from stored
   *  fields because Casper has no off-chain view-call (see `glide.ts`). */
  currentTargetAllocation: Record<string, number>;
  /** Raw token balances held by the vault. */
  holdings: Record<string, string>;
  targetAmountUsd: string; // raw 6 dp
  targetYear: number;
  createdYear: number;
}

/** Odra field indices (1-based declaration order) in each module's `state` dict. */
const ORACLE_FIELD = { keeper: 1, prices: 2 } as const;
const VAULT_FIELD = {
  owner: 1,
  agent: 2,
  profile: 3,
  baseAllocation: 4,
  targetAmountUsd: 5,
  targetYear: 6,
  createdYear: 7,
} as const;

/** Minimal shapes of the RPC `rawJSON` we read (keeps the reads off `any`). */
interface RawContractPackage {
  stored_value?: {
    ContractPackage?: {
      versions?: { contract_version: number; contract_hash: string }[];
    };
  };
}
interface RawClValue {
  stored_value?: { CLValue?: { bytes?: string } };
}

/**
 * True only for Casper's "value not found" RPC error (code -32003) — i.e. a
 * dictionary item that was never written (unset price, zero balance). Network
 * and other RPC errors return false so callers surface them instead of masking
 * an outage as a zero value.
 */
export function isValueNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('-32003');
}

/**
 * The ONLY module that talks to Casper (golden rule #2). It reads vault/oracle
 * state and (next) holds the AGENT HOT KEY for `execute_buy` / `rebalance`.
 *
 * Reads use direct global-state / dictionary queries (Odra stores all `Var`/
 * `Mapping` data in one "state" dictionary; CEP-18 balances in their own named
 * dictionary). There is NO off-chain entry-point call on Casper 2.0, so the
 * glide target is recomputed from stored fields (see `glide.ts`).
 *
 * 🔴 The agent key may ONLY trigger `execute_buy` / `rebalance` (enforced
 * on-chain). NEVER construct a withdraw or any fund-moving deploy with it
 * (golden rule #4). Never log or return the key (golden rule #8).
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  private readonly cfg = loadCasperConfig();
  private rpc?: RpcClient;
  /** package-hash (hex) → current contract-hash (hex). Resolved once per package. */
  private readonly contractHashCache = new Map<string, string>();

  /* ------------------------------ reads ------------------------------ */

  /** Current oracle prices per asset (raw USD, 6 dp). Reads `PriceOracle.prices`. */
  async getPrices(): Promise<Record<AssetSymbol, bigint>> {
    const oracle = requireValue(this.cfg.oracleHash, 'ORACLE_HASH');
    const out = {} as Record<AssetSymbol, bigint>;
    for (const sym of ASSET_SYMBOLS) {
      const tokenHash = requireValue(
        this.cfg.tokenHashes[sym],
        `TOKEN_${sym.toUpperCase()}_HASH`,
      );
      const itemKey = mappingItemKey(
        ORACLE_FIELD.prices,
        contractKeyBytes(tokenHash),
      );
      const bytes = await this.readStateItem(oracle, itemKey);
      out[sym] = bytes ? decodeU256(bytes) : 0n;
    }
    return out;
  }

  /** Read holdings + config from a vault, and recompute the glide target. */
  async viewState(vaultHash: string): Promise<VaultState> {
    if (!vaultHash) throw new Error('viewState: vaultHash is required');
    const v = vaultHash;

    const [
      owner,
      agent,
      profileB,
      baseB,
      targetAmtB,
      targetYearB,
      createdYearB,
    ] = await Promise.all([
      this.readStateItem(v, varItemKey(VAULT_FIELD.owner)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.agent)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.profile)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.baseAllocation)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.targetAmountUsd)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.targetYear)),
      this.readStateItem(v, varItemKey(VAULT_FIELD.createdYear)),
    ]);

    if (
      !owner ||
      !agent ||
      !profileB ||
      !baseB ||
      !createdYearB ||
      !targetYearB
    ) {
      throw new Error(`vault ${vaultHash} is not initialized (missing state)`);
    }

    const profile = decodeProfile(profileB);
    const base = decodeVecU32(baseB);
    const targetYear = decodeU32(targetYearB);
    const createdYear = decodeU32(createdYearB);
    const targetAmountUsd = targetAmtB ? decodeU256(targetAmtB) : 0n;

    const target = glideTarget(
      base,
      END_ALLOCATION[profile],
      createdYear,
      targetYear,
      currentYear(),
    );

    const holdings = await this.readHoldings(v);

    return {
      owner: decodeAddress(owner),
      agent: decodeAddress(agent),
      profile,
      baseAllocation: vectorToAllocation(base),
      currentTargetAllocation: vectorToAllocation(target),
      holdings,
      targetAmountUsd: targetAmountUsd.toString(),
      targetYear,
      createdYear,
    };
  }

  /** Raw CEP-18 balance of the vault for each asset (canonical order). */
  private async readHoldings(
    vaultHash: string,
  ): Promise<Record<string, string>> {
    const holderKey = cep18ItemKey(contractKeyBytes(vaultHash));
    const out: Record<string, string> = {};
    for (const sym of ASSET_SYMBOLS) {
      const tokenHash = this.cfg.tokenHashes[sym];
      if (!tokenHash) {
        out[sym] = '0';
        continue;
      }
      // CEP-18 `balances` is a NATIVE U256 dictionary (no List(U8) wrap).
      const bytes = await this.readNativeDictItem(
        tokenHash,
        'balances',
        holderKey,
      );
      out[sym] = (bytes ? decodeU256(bytes) : 0n).toString();
    }
    return out;
  }

  /* ------------------------- agent writes (next) ------------------------- */

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

  /* ----------------------------- internals ----------------------------- */

  private client(): RpcClient {
    if (!this.rpc) {
      const url = requireValue(this.cfg.nodeUrl, 'CASPER_NODE_URL');
      this.rpc = new RpcClient(new HttpHandler(url));
    }
    return this.rpc;
  }

  /** Resolve a package hash to its current contract hash (Casper legacy entity). */
  private async resolveContractHash(packageHash: string): Promise<string> {
    const pkgHex = packageHash.replace(/^hash-/, '');
    const cached = this.contractHashCache.get(pkgHex);
    if (cached) return cached;
    const res = await this.client().queryLatestGlobalState(
      `hash-${pkgHex}`,
      [],
    );
    const versions = (res.rawJSON as RawContractPackage)?.stored_value
      ?.ContractPackage?.versions;
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error(`no contract versions for package ${packageHash}`);
    }
    const latest = versions.reduce((a, b) =>
      b.contract_version > a.contract_version ? b : a,
    );
    const hex = latest.contract_hash.replace(/^contract-/, '');
    this.contractHashCache.set(pkgHex, hex);
    return hex;
  }

  /** Read a value from a contract dictionary; returns the raw value bytes or null. */
  private async readDictBytes(
    packageHash: string,
    dictName: string,
    itemKey: string,
  ): Promise<Uint8Array | null> {
    const contractHex = await this.resolveContractHash(packageHash);
    const id = new ParamDictionaryIdentifier(
      undefined,
      new ParamDictionaryIdentifierContractNamedKey(
        `hash-${contractHex}`,
        dictName,
        itemKey,
      ),
    );
    try {
      const res = await this.client().getDictionaryItemByIdentifier(null, id);
      const hex = (res.rawJSON as RawClValue)?.stored_value?.CLValue?.bytes;
      return typeof hex === 'string'
        ? Uint8Array.from(Buffer.from(hex, 'hex'))
        : null;
    } catch (err) {
      // A missing dictionary item (Casper -32003) means the value was never set
      // (unset price, zero balance) → null. Any OTHER error (e.g. node/network
      // failure) must propagate, so a transient outage is never silently read as
      // "price/balance = 0".
      if (isValueNotFound(err)) return null;
      throw err;
    }
  }

  /** Read an Odra `Var`/`Mapping` item from the "state" dict (List(U8)-wrapped). */
  private async readStateItem(
    packageHash: string,
    itemKey: string,
  ): Promise<Uint8Array | null> {
    const bytes = await this.readDictBytes(packageHash, STATE_DICT, itemKey);
    return bytes ? unwrapStateBytes(bytes) : null;
  }

  /** Read a native-CLValue dictionary item (e.g. CEP-18 `balances`). */
  private async readNativeDictItem(
    packageHash: string,
    dictName: string,
    itemKey: string,
  ): Promise<Uint8Array | null> {
    return this.readDictBytes(packageHash, dictName, itemKey);
  }

  private notImplemented(method: string, detail?: string): never {
    this.logger.warn(
      `ChainService.${method}(${detail ?? ''}) not implemented (network=${this.cfg.network})`,
    );
    throw new Error(`ChainService.${method}: not implemented`);
  }
}
