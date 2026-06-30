/**
 * Mocked-RPC encode→decode round-trip for the chain READS (`getPrices` /
 * `viewState` / the not-found→0 path), plus two golden-rule guardrails:
 *   #4 — `ChainService` exposes NO withdraw/fund-moving method.
 *   #8 — the agent key never appears in a log line during a write.
 *
 * The wire bytes are built here from first principles (Casper `bytesrepr`), fed
 * through a fake `RpcClient`, and we assert the service decodes them back to the
 * original values — so a regression in `odra.codec` parsing or the read plumbing
 * (contract-hash resolution, hex→bytes, List(U8) unwrap) is caught. No network.
 *
 * Infra hashes come from backend/.env when present; in CI any missing one falls
 * back to a valid-format dummy so the spec stays hermetic (token hashes are hex,
 * parsed by Key.newKey / contractKeyBytes).
 */
import 'dotenv/config';
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import type { Logger } from '@nestjs/common';
import { ChainService } from './chain.service';
import { ASSET_SYMBOLS, type AssetSymbol } from '../config/constants';
import {
  cep18ItemKey,
  contractKeyBytes,
  mappingItemKey,
  varItemKey,
} from './odra.codec';

/* ----------------------------- env hermeticity ---------------------------- */

const HASH = (c: string): string => `hash-${c.repeat(64)}`;
const ENV_FALLBACK: Record<string, string> = {
  ORACLE_HASH: HASH('a'),
  TOKEN_MUSDC_HASH: HASH('1'),
  TOKEN_MBTC_HASH: HASH('2'),
  TOKEN_MNVDAX_HASH: HASH('3'),
  TOKEN_MXAUT_HASH: HASH('4'),
  TOKEN_MGOOGLX_HASH: HASH('5'),
};
const envAdded: string[] = [];
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV_FALLBACK)) {
    if (!process.env[k]) {
      process.env[k] = v;
      envAdded.push(k);
    }
  }
});
afterAll(() => {
  for (const k of envAdded) delete process.env[k];
});

/* ---------------------- first-principles byte encoders --------------------- */
// Independent of odra.codec's decoder, so the round-trip is a real cross-check.

const u32LE = (v: number): number[] => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];
/** Casper U256 `bytesrepr`: [len][len little-endian bytes], minimal length. */
const u256Repr = (v: bigint): number[] => {
  const out: number[] = [];
  let x = v;
  while (x > 0n) {
    out.push(Number(x & 0xffn));
    x >>= 8n;
  }
  return [out.length, ...out];
};
/** Address `bytesrepr`: [tag][32 bytes]; tag 0x00 = account, 0x01 = hash. */
const addrRepr = (tag: number, hex32: string): number[] => [
  tag,
  ...Buffer.from(hex32, 'hex'),
];
/** Vec<U32> `bytesrepr`: [u32 count][u32 × count]. */
const vecU32Repr = (vals: number[]): number[] => [
  ...u32LE(vals.length),
  ...vals.flatMap(u32LE),
];
/** Odra "state" value = CLValue List(U8) = [u32 LE length][inner bytesrepr]. */
const stateWrap = (inner: number[]): number[] => [
  ...u32LE(inner.length),
  ...inner,
];
const toHex = (bytes: number[]): string => Buffer.from(bytes).toString('hex');

/* ------------------------------- fake RpcClient ---------------------------- */

interface DictId {
  contractNamedKey: { dictionaryName: string; dictionaryItemKey: string };
}
type Dict = Record<string, string>; // itemKey -> CLValue.bytes hex

/** A fake RpcClient that serves prebuilt dictionary bytes, routed by (dict, key). */
const fakeRpc = (
  state: Dict,
  balances: Dict = {},
  opts: { hardError?: boolean } = {},
) => ({
  queryLatestGlobalState: jest.fn().mockResolvedValue({
    rawJSON: {
      stored_value: {
        ContractPackage: {
          versions: [
            {
              contract_version: 1,
              contract_hash: `contract-${'c'.repeat(64)}`,
            },
          ],
        },
      },
    },
  }),
  getDictionaryItemByIdentifier: jest.fn((_uref: null, id: DictId) => {
    if (opts.hardError) {
      return Promise.reject(new Error('connection refused')); // NOT -32003
    }
    const { dictionaryName, dictionaryItemKey } = id.contractNamedKey;
    const map = dictionaryName === 'balances' ? balances : state;
    const bytes = map[dictionaryItemKey];
    if (bytes === undefined) {
      return Promise.reject(new Error('rpc error -32003 ValueNotFound'));
    }
    return Promise.resolve({
      rawJSON: { stored_value: { CLValue: { bytes } } },
    });
  }),
});

const inject = (chain: ChainService, rpc: ReturnType<typeof fakeRpc>): void => {
  (chain as unknown as { rpc: unknown }).rpc = rpc;
};

const tokenHash = (sym: AssetSymbol): string =>
  process.env[`TOKEN_${sym.toUpperCase()}_HASH`] as string;

/* --------------------------------- getPrices ------------------------------- */

describe('ChainService.getPrices — mocked-RPC round-trip', () => {
  const PRICES: Record<AssetSymbol, bigint> = {
    mUSDC: 1_000_000n,
    mBTC: 65_000_000_000n,
    mNVDAx: 100_000_000n,
    mXAUT: 2_350_000_000n,
    mGOOGLx: 150_000_000n,
  };

  it('decodes each oracle price (U256) back to raw 6dp', async () => {
    const state: Dict = {};
    for (const sym of ASSET_SYMBOLS) {
      // oracle `prices` Mapping is field #2 (keyed by the token Address).
      const key = mappingItemKey(2, contractKeyBytes(tokenHash(sym)));
      state[key] = toHex(stateWrap(u256Repr(PRICES[sym])));
    }
    const chain = new ChainService();
    inject(chain, fakeRpc(state));

    await expect(chain.getPrices()).resolves.toEqual(PRICES);
  });

  it('treats an unset price (Casper -32003) as 0, not an error', async () => {
    const chain = new ChainService();
    inject(chain, fakeRpc({})); // nothing stored → every read is "not found"
    const prices = await chain.getPrices();
    expect(prices.mBTC).toBe(0n);
    expect(Object.values(prices).every((p) => p === 0n)).toBe(true);
  });

  it('propagates a non -32003 RPC error (never masks an outage as 0)', async () => {
    const chain = new ChainService();
    inject(chain, fakeRpc({}, {}, { hardError: true }));
    await expect(chain.getPrices()).rejects.toThrow(/connection refused/);
  });
});

/* --------------------------------- viewState ------------------------------- */

describe('ChainService.viewState — mocked-RPC round-trip', () => {
  const VAULT = HASH('e');
  const OWNER = '11'.repeat(32);
  const AGENT = '22'.repeat(32);
  const BASE = [3000, 1000, 1000, 4000, 1000]; // canonical order, Σ = 10000
  const TARGET_AMT = 100_000_000_000n; // $100k raw 6dp
  const TARGET_YEAR = 2045;
  const CREATED_YEAR = 2025;
  const HOLDING = 5_000_000n; // shared across tokens (same holder item key)

  const fullState = (): Dict => ({
    [varItemKey(1)]: toHex(stateWrap(addrRepr(0x00, OWNER))), // owner (account)
    [varItemKey(2)]: toHex(stateWrap(addrRepr(0x00, AGENT))), // agent (account)
    [varItemKey(3)]: toHex(stateWrap([1])), // profile enum tag 1 = Moderate
    [varItemKey(4)]: toHex(stateWrap(vecU32Repr(BASE))), // baseAllocation
    [varItemKey(5)]: toHex(stateWrap(u256Repr(TARGET_AMT))), // targetAmountUsd
    [varItemKey(6)]: toHex(stateWrap(u32LE(TARGET_YEAR))), // targetYear
    [varItemKey(7)]: toHex(stateWrap(u32LE(CREATED_YEAR))), // createdYear
  });
  const balances = (): Dict => ({
    [cep18ItemKey(contractKeyBytes(VAULT))]: toHex(u256Repr(HOLDING)), // native U256, no wrap
  });

  it('decodes stored Vars + CEP-18 holdings into VaultState', async () => {
    const chain = new ChainService();
    inject(chain, fakeRpc(fullState(), balances()));

    const s = await chain.viewState(VAULT);

    expect(s.owner).toBe(`account-hash-${OWNER}`);
    expect(s.agent).toBe(`account-hash-${AGENT}`);
    expect(s.profile).toBe('Moderate');
    expect(s.baseAllocation).toEqual({
      mUSDC: 3000,
      mBTC: 1000,
      mNVDAx: 1000,
      mXAUT: 4000,
      mGOOGLx: 1000,
    });
    expect(s.targetAmountUsd).toBe('100000000000');
    expect(s.targetYear).toBe(2045);
    expect(s.createdYear).toBe(2025);
    // Every token shares the vault's holder item key → same decoded balance.
    expect(s.holdings).toEqual({
      mUSDC: '5000000',
      mBTC: '5000000',
      mNVDAx: '5000000',
      mXAUT: '5000000',
      mGOOGLx: '5000000',
    });
    // Glide target is recomputed (covered exactly by glide.spec); just assert it
    // is a well-formed allocation.
    const sum = Object.values(s.currentTargetAllocation).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(10_000);
  });

  it('throws when the vault is missing required state (uninitialized)', async () => {
    const partial = fullState();
    delete partial[varItemKey(1)]; // owner unset
    const chain = new ChainService();
    inject(chain, fakeRpc(partial, balances()));
    await expect(chain.viewState(VAULT)).rejects.toThrow(/not initialized/);
  });
});

/* ----------------------------- golden-rule guards -------------------------- */

describe('ChainService — golden-rule guardrails', () => {
  it('#4: exposes no withdraw / fund-moving method', () => {
    const names = Object.getOwnPropertyNames(ChainService.prototype).filter(
      (n) => n !== 'constructor',
    );
    const forbidden =
      /withdraw|transfer|sweep|drain|payout|cashout|redeem|movefunds/i;
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
    // The only vault-targeted writes are the two agent triggers (no deposit/withdraw).
    const vaultWrites = names.filter((n) =>
      /buy|rebalance|deposit|withdraw/i.test(n),
    );
    expect(new Set(vaultWrites)).toEqual(new Set(['executeBuy', 'rebalance']));
  });

  it('#8: never logs the agent key during a write', async () => {
    const chain = new ChainService();
    const key = PrivateKey.generate(KeyAlgorithm.ED25519); // synchronous in v5
    const secretHex = Buffer.from(key.toBytes()).toString('hex');
    // Inject the key directly (no PEM on disk) and a no-op tx submitter.
    (chain as unknown as { signingKey: PrivateKey }).signingKey = key;
    inject(chain, {
      putTransaction: jest.fn().mockResolvedValue(undefined),
      waitForTransaction: jest.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof fakeRpc>);

    const logs: string[] = [];
    const logger = (chain as unknown as { logger: Logger }).logger;
    jest.spyOn(logger, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    jest.spyOn(logger, 'warn').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });

    await chain.setPrice('mBTC', 1n);

    expect(logs.length).toBeGreaterThan(0); // it did log (the tx-hash line)
    for (const line of logs) {
      expect(line).not.toContain(secretHex);
      expect(line).not.toContain('PRIVATE KEY');
    }
  });
});
