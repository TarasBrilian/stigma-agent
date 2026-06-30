/**
 * Unit test for the write ROUTING + argument construction. The build/sign/submit
 * step (`call`) is stubbed, so no key or network is needed: each method still runs
 * `requireValue` + `Key.newKey` + `CLValue`/`Args` for real (catching encoding
 * mistakes), then we assert it targets the right contract + entry point + gas.
 *
 * On-chain acceptance of the TransactionV1 is validated separately by the opt-in
 * live test (see chain.live.spec.ts pattern). Infra hashes come from backend/.env
 * when present; in CI (no .env) any missing hash falls back to a valid-format
 * dummy below, so this routing test is hermetic and never needs committed hashes.
 */
import 'dotenv/config';
import { Args } from 'casper-js-sdk';
import { ChainService } from './chain.service';

/**
 * Fill any MISSING infra hash with a valid-format dummy. Token hashes are parsed
 * by `Key.newKey`, so they must be `hash-<64 hex>`. Real backend/.env values
 * (local dev) are left untouched; only absent keys (CI) get a fallback, restored
 * afterwards so nothing leaks into other specs in the same worker.
 */
const HASH = (c: string): string => `hash-${c.repeat(64)}`;
const ENV_FALLBACK: Record<string, string> = {
  ORACLE_HASH: HASH('a'),
  VAULT_REGISTRY_HASH: HASH('b'),
  TOKEN_MUSDC_HASH: HASH('c'),
  TOKEN_MBTC_HASH: HASH('d'),
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

/** The private `call` signature, exposed for a typed spy (no `any` leakage). */
type CallFn = (
  packageHash: string,
  entryPoint: string,
  args: Args,
  gasMotes: number,
) => Promise<string>;

describe('ChainService writes — routing', () => {
  let chain: ChainService;
  let callSpy: jest.SpyInstance<ReturnType<CallFn>, Parameters<CallFn>>;

  beforeEach(() => {
    chain = new ChainService();
    callSpy = jest
      .spyOn(chain as unknown as { call: CallFn }, 'call')
      .mockResolvedValue('deadbeef');
  });

  const last = (): Parameters<CallFn> =>
    callSpy.mock.calls[callSpy.mock.calls.length - 1];

  it('executeBuy → vault.execute_buy, no amounts, trigger-level gas', async () => {
    await expect(chain.executeBuy('hash-vault')).resolves.toBe('deadbeef');
    const [pkg, entry, args, gas] = last();
    expect(pkg).toBe('hash-vault');
    expect(entry).toBe('execute_buy');
    expect(args).toBeInstanceOf(Args);
    expect(gas).toBeGreaterThanOrEqual(100_000_000_000); // ≥100 CSPR
  });

  it('rebalance → vault.rebalance', async () => {
    await chain.rebalance('hash-vault');
    const [pkg, entry] = last();
    expect(pkg).toBe('hash-vault');
    expect(entry).toBe('rebalance');
  });

  it('setPrice → oracle.set_price(token, price)', async () => {
    await chain.setPrice('mBTC', 65_000_000_000n);
    const [pkg, entry, args, gas] = last();
    expect(pkg).toBe(process.env.ORACLE_HASH);
    expect(entry).toBe('set_price');
    expect(args).toBeInstanceOf(Args);
    expect(gas).toBeLessThan(100_000_000_000); // cheap write, not a trigger
  });

  it('register → registry.register(owner, vault)', async () => {
    await chain.register(
      'account-hash-b9f3740ef94e78a56f86fa795a6fd136f432164e3c1915284bc2636b7cf933b8',
      'hash-5e83185e1c3fc08d5d065f377c372c7df66de1f64ea9b213cc7f6ea39fa96a2e',
    );
    const [pkg, entry] = last();
    expect(pkg).toBe(process.env.VAULT_REGISTRY_HASH);
    expect(entry).toBe('register');
  });

  it('faucetMint → mUSDC.faucet_mint(amount)', async () => {
    await chain.faucetMint('account-hash-aa', 1_000_000n);
    const [pkg, entry] = last();
    expect(pkg).toBe(process.env.TOKEN_MUSDC_HASH);
    expect(entry).toBe('faucet_mint');
  });
});
