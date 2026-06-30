/**
 * LIVE testnet cross-check (opt-in) — proves `ChainService` decodes a REAL
 * deployed vault end to end. SKIPPED unless `LIVE_VAULT_HASH` is set, so the
 * normal `pnpm test` (and CI) never hit the network.
 *
 * Run against the smoke vault from `contract/bin/deploy_vault.rs`:
 *
 *   LIVE_VAULT_HASH=hash-5e83185e1c3fc08d5d065f377c372c7df66de1f64ea9b213cc7f6ea39fa96a2e \
 *     pnpm test -- chain.live
 *
 * The expected values are the post-smoke on-chain state, verified independently
 * via the Rust runner's gas-free `VAULT_READ` (deposited $10k; `execute_buy`
 * swapped into the exact Moderate target). See
 * `../../../contract/deployed.casper-test.json` `test_vault`.
 */
import 'dotenv/config';
import { weightsBps } from '../config/money';
import { ChainService } from './chain.service';
import { currentYear } from './glide';

const VAULT = process.env.LIVE_VAULT_HASH ?? '';
const DEPLOYER =
  'account-hash-b9f3740ef94e78a56f86fa795a6fd136f432164e3c1915284bc2636b7cf933b8';

// Opt-in: only runs when LIVE_VAULT_HASH is provided.
const live = VAULT ? describe : describe.skip;

live('ChainService — live testnet reads', () => {
  jest.setTimeout(60_000);
  let chain: ChainService;
  beforeAll(() => {
    chain = new ChainService();
  });

  it('getPrices() decodes the seeded oracle prices (raw 6dp)', async () => {
    await expect(chain.getPrices()).resolves.toEqual({
      mUSDC: 1_000_000n,
      mBTC: 65_000_000_000n,
      mNVDAx: 100_000_000n,
      mXAUT: 2_000_000_000n,
      mGOOGLx: 150_000_000n,
    });
  });

  it('viewState() decodes the vault stored fields + holdings', async () => {
    const s = await chain.viewState(VAULT);

    // Stored config (decoded from the Odra "state" dict).
    expect(s.owner).toBe(DEPLOYER);
    expect(s.agent).toBe(DEPLOYER); // owner == agent == deployer (single-key smoke)
    expect(s.profile).toBe('Moderate');
    expect(s.baseAllocation).toEqual({
      mUSDC: 0,
      mBTC: 2000,
      mNVDAx: 3000,
      mXAUT: 4000,
      mGOOGLx: 1000,
    });
    expect(s.targetAmountUsd).toBe('100000000000'); // $100,000 (6dp)
    expect(s.targetYear).toBe(2040);
    expect(s.createdYear).toBe(2026);

    // Holdings (CEP-18 balances dict). The vault stays at the Moderate target, so
    // assert the WEIGHTS (robust to the total value changing as deposits invest /
    // to integer dust) — idle mUSDC fully invested, each asset at its target share.
    const prices = await chain.getPrices();
    const weights = weightsBps(s.holdings, prices);
    const nearBps = (actual: number, target: number, tol = 50): void => {
      expect(Math.abs(actual - target)).toBeLessThanOrEqual(tol);
    };
    expect(s.holdings.mUSDC).toBe('0');
    nearBps(weights.mBTC ?? 0, 2000); //    20%
    nearBps(weights.mNVDAx ?? 0, 3000); //  30%
    nearBps(weights.mXAUT ?? 0, 4000); //   40%
    nearBps(weights.mGOOGLx ?? 0, 1000); // 10%

    // Glide target is recomputed off-chain (glide.ts, pinned by glide.spec.ts):
    // Σ must be 10000, and while currentYear == createdYear it equals base.
    const sumTarget = Object.values(s.currentTargetAllocation).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sumTarget).toBe(10_000);
    if (currentYear() === s.createdYear) {
      expect(s.currentTargetAllocation).toEqual(s.baseAllocation);
    }
  });
});
