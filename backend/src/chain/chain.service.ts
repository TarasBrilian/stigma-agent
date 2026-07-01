import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import {
  Args,
  CLValue,
  ContractCallBuilder,
  HttpHandler,
  Key,
  KeyAlgorithm,
  ParamDictionaryIdentifier,
  ParamDictionaryIdentifierContractNamedKey,
  PrivateKey,
  PublicKey,
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

/** Gas (motes) per write. Triggers do several cross-contract swaps, so they pay
 *  more than the cheap single-write calls. Tunable via env. */
const TRIGGER_GAS_MOTES = Number(
  process.env.AGENT_TRIGGER_GAS_MOTES ?? 120_000_000_000, // 120 CSPR (execute_buy / rebalance)
);
const WRITE_GAS_MOTES = Number(
  process.env.AGENT_WRITE_GAS_MOTES ?? 10_000_000_000, // 10 CSPR (set_price / register / faucet)
);
/** How long to wait for a submitted tx to finalize before proceeding (ms). */
const TX_WAIT_MS = Number(process.env.AGENT_TX_WAIT_MS ?? 180_000); // 3 min

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

/** Retry policy for a TRANSIENT RPC transport blip (flaky public node). */
const RPC_RETRY_ATTEMPTS = 3;
const RPC_RETRY_BACKOFF_MS = 400;
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for a transient network/transport failure (a public-node "Network Error",
 * timeout, or dropped connection) — NOT an app-level RPC error like -32003 or an
 * on-chain revert. Only these are worth retrying; real signals must propagate.
 */
export function isTransientRpcError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('network error') ||
    msg.includes('failed to send http request') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up')
  );
}

/**
 * Build an account `Address` Key from the `owner` the frontend reports — either an
 * already-formatted `account-hash-…`/`hash-…` string, or a raw public-key hex (the
 * wallet identifier). The vault's on-chain `owner` is the account hash of the
 * user's key, so a bare public key is converted to match.
 */
export function accountKey(owner: string): Key {
  if (owner.startsWith('account-hash-') || owner.startsWith('hash-')) {
    return Key.newKey(owner);
  }
  return Key.newKey(PublicKey.fromHex(owner).accountHash().toPrefixedString());
}

/**
 * The ONLY module that talks to Casper (golden rule #2). It reads vault/oracle
 * state and holds the AGENT HOT KEY for the writes (`execute_buy` / `rebalance`
 * on a vault; plus `set_price` / `register` / `faucet_mint`).
 *
 * Reads use direct global-state / dictionary queries (Odra stores all `Var`/
 * `Mapping` data in one "state" dictionary; CEP-18 balances in their own named
 * dictionary). There is NO off-chain entry-point call on Casper 2.0, so the
 * glide target is recomputed from stored fields (see `glide.ts`).
 *
 * 🔴 On a VAULT, the agent key may ONLY reach `execute_buy` / `rebalance`
 * (enforced on-chain) — NEVER construct a withdraw or any fund-moving vault call
 * with it (golden rule #4). The other writes here (`set_price`, `register`,
 * `faucet_mint`) target the oracle/registry/token, not a vault, and move no vault
 * funds. Never log or return the key (golden rule #8).
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  private readonly cfg = loadCasperConfig();
  private rpc?: RpcClient;
  /** The agent hot key, loaded once from disk. 🔴 Never logged or returned. */
  private signingKey?: PrivateKey;
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

  /** The vault's idle (uninvested) mUSDC balance — raw 6 dp. Drives deposit→buy:
   *  a positive value means a deposit (or withdraw remainder) is waiting to be
   *  invested. One dictionary read — cheap enough to poll. */
  async idleMusdc(vaultHash: string): Promise<bigint> {
    if (!vaultHash) throw new Error('idleMusdc: vaultHash is required');
    const musdc = requireValue(this.cfg.tokenHashes.mUSDC, 'TOKEN_MUSDC_HASH');
    const holderKey = cep18ItemKey(contractKeyBytes(vaultHash));
    const bytes = await this.readNativeDictItem(musdc, 'balances', holderKey);
    return bytes ? decodeU256(bytes) : 0n;
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

  /* ------------------------------- writes -------------------------------- */
  // Every write is signed by the single hot key at AGENT_SECRET_KEY_PATH and
  // submitted as a TransactionV1 contract call (see `call`). 🔴 On a VAULT this
  // key may ONLY reach `execute_buy` / `rebalance` (enforced on-chain); never
  // construct a withdraw or any fund-moving vault call with it (golden #4/#8).
  // `set_price` (oracle keeper), `register` (permissionless) and `faucet_mint`
  // are operational/demo calls — not agent-vault actions.

  /** Agent trigger: invest idle mUSDC across the computed target (no amounts). */
  executeBuy(vaultHash: string): Promise<string> {
    return this.call(
      vaultHash,
      'execute_buy',
      Args.fromMap({}),
      TRIGGER_GAS_MOTES,
    );
  }

  /** Agent trigger: rebalance holdings back to the exact computed target. */
  rebalance(vaultHash: string): Promise<string> {
    return this.call(
      vaultHash,
      'rebalance',
      Args.fromMap({}),
      TRIGGER_GAS_MOTES,
    );
  }

  /** Keeper: write a reference price (raw USD 6dp) to the mock oracle. */
  setPrice(token: AssetSymbol, priceUsd6: bigint): Promise<string> {
    const oracle = requireValue(this.cfg.oracleHash, 'ORACLE_HASH');
    const tokenHash = requireValue(
      this.cfg.tokenHashes[token],
      `TOKEN_${token.toUpperCase()}_HASH`,
    );
    const args = Args.fromMap({
      token: CLValue.newCLKey(Key.newKey(tokenHash)),
      price: CLValue.newCLUInt256(priceUsd6.toString()),
    });
    return this.call(oracle, 'set_price', args, WRITE_GAS_MOTES);
  }

  /** Permissionless: record `vault` under `owner` in the registry (moves no funds). */
  register(owner: string, vault: string): Promise<string> {
    const registry = requireValue(this.cfg.registryHash, 'VAULT_REGISTRY_HASH');
    const args = Args.fromMap({
      owner: CLValue.newCLKey(accountKey(owner)),
      vault: CLValue.newCLKey(Key.newKey(vault)),
    });
    return this.call(registry, 'register', args, WRITE_GAS_MOTES);
  }

  /**
   * Demo faucet: mint test mUSDC. ⚠️ The contract `faucet_mint` mints to the
   * CALLER (this signing key) — there is no recipient arg — so this funds the
   * BACKEND account, not `owner`. To fund a user's wallet for a deposit, the user
   * signs `faucet_mint` in the frontend. `owner` is kept for the API shape only.
   */
  faucetMint(owner: string, amountUsd6: bigint): Promise<string> {
    const musdc = requireValue(this.cfg.tokenHashes.mUSDC, 'TOKEN_MUSDC_HASH');
    this.logger.warn(
      `faucetMint funds the signing key, not ${owner} (contract faucet is caller-minted)`,
    );
    const args = Args.fromMap({
      amount: CLValue.newCLUInt256(amountUsd6.toString()),
    });
    return this.call(musdc, 'faucet_mint', args, WRITE_GAS_MOTES);
  }

  /* ----------------------------- internals ----------------------------- */

  private client(): RpcClient {
    if (!this.rpc) {
      const url = requireValue(this.cfg.nodeUrl, 'CASPER_NODE_URL');
      this.rpc = new RpcClient(new HttpHandler(url));
    }
    return this.rpc;
  }

  /**
   * Run an RPC call, retrying a TRANSIENT transport failure (a flaky public-node
   * "Network Error"/timeout) a few times with a short backoff. App-level RPC
   * errors (value-not-found -32003, on-chain reverts) are not transient and
   * propagate immediately, so callers still see the real signal (golden rule:
   * surface chain errors — a network blip just isn't one).
   */
  private async withRpcRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!isTransientRpcError(err) || attempt >= RPC_RETRY_ATTEMPTS)
          throw err;
        this.logger.warn(
          `RPC transient failure (attempt ${attempt}/${RPC_RETRY_ATTEMPTS}), retrying: ${(err as Error).message}`,
        );
        await delay(RPC_RETRY_BACKOFF_MS * attempt);
      }
    }
  }

  /**
   * Lazily load the hot key from `AGENT_SECRET_KEY_PATH`. Algorithm is detected
   * from the PEM header (Casper EC keys are secp256k1; otherwise ed25519).
   * 🔴 Golden rule #8: this value is never logged or returned over the API.
   */
  private signer(): PrivateKey {
    if (!this.signingKey) {
      const path = requireValue(this.cfg.agentKeyPath, 'AGENT_SECRET_KEY_PATH');
      const pem = readFileSync(path, 'utf8');
      const algorithm = pem.includes('EC PRIVATE KEY')
        ? KeyAlgorithm.SECP256K1
        : KeyAlgorithm.ED25519;
      this.signingKey = PrivateKey.fromPem(pem, algorithm);
    }
    return this.signingKey;
  }

  /**
   * Build → sign → submit a TransactionV1 contract call by package hash, then wait
   * for finalization and surface any on-chain revert (golden rule: don't swallow
   * chain errors — a failed swap leg or guard becomes a thrown error). Returns the
   * transaction hash. A confirmation timeout is logged, not thrown (the tx is
   * already submitted; the caller reconciles via reads).
   */
  private async call(
    packageHash: string,
    entryPoint: string,
    args: Args,
    paymentMotes: number,
  ): Promise<string> {
    const key = this.signer();
    const pkgHex = packageHash.replace(/^(hash-|contract-)/, '');
    const tx = new ContractCallBuilder()
      .from(key.publicKey)
      .byPackageHash(pkgHex)
      .entryPoint(entryPoint)
      .runtimeArgs(args)
      .chainName(this.cfg.network)
      .payment(paymentMotes)
      .build();
    tx.sign(key);
    const hash = tx.hash.toHex();
    await this.client().putTransaction(tx);
    this.logger.log(`${entryPoint} → tx ${hash} (awaiting finalization)`);

    const info = await this.client()
      .waitForTransaction(tx, TX_WAIT_MS)
      .catch((err: Error) => {
        this.logger.warn(
          `${entryPoint} tx ${hash}: not confirmed within ${TX_WAIT_MS}ms (${err.message})`,
        );
        return null;
      });
    if (!info) return hash;
    const revert = info.executionInfo?.executionResult?.errorMessage;
    if (revert) {
      throw new Error(
        `${entryPoint} reverted on-chain (tx ${hash}): ${revert}`,
      );
    }
    this.logger.log(`${entryPoint} ✓ executed (tx ${hash})`);
    return hash;
  }

  /** Resolve a package hash to its current contract hash (Casper legacy entity). */
  private async resolveContractHash(packageHash: string): Promise<string> {
    const pkgHex = packageHash.replace(/^hash-/, '');
    const cached = this.contractHashCache.get(pkgHex);
    if (cached) return cached;
    const res = await this.withRpcRetry(() =>
      this.client().queryLatestGlobalState(`hash-${pkgHex}`, []),
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
      const res = await this.withRpcRetry(() =>
        this.client().getDictionaryItemByIdentifier(null, id),
      );
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
}
