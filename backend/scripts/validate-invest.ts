/**
 * LIVE deposit→buy validation — SPENDS gas. Proves the keeper's autonomous invest:
 * reads the vault's idle mUSDC, and if it clears the threshold, calls executeBuy.
 * Precondition: the vault was funded with idle mUSDC (no execute_buy) — see the
 * contract runner's `VAULT_FUND` mode.
 *
 * Run from backend/:
 *   AGENT_SECRET_KEY_PATH=../contract/casper_account.pem \
 *   AGENT_TRIGGER_GAS_MOTES=80000000000 \
 *     npx ts-node --transpile-only scripts/validate-invest.ts
 */
import 'dotenv/config';
import { ChainService } from '../src/chain/chain.service';
import { KeeperService } from '../src/keeper/keeper.service';

const VAULT =
  'hash-5e83185e1c3fc08d5d065f377c372c7df66de1f64ea9b213cc7f6ea39fa96a2e';

async function main(): Promise<void> {
  const chain = new ChainService();
  // investIdle only touches `chain`; the other deps are unused here.
  const keeper = new KeeperService(
    undefined as never,
    chain,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  const before = await chain.idleMusdc(VAULT);
  console.log(`idle before : ${before} (${Number(before) / 1e6} mUSDC)`);

  const result = await keeper.investIdle(VAULT);
  console.log(`investIdle   : ${JSON.stringify(result)}`);

  const after = await chain.idleMusdc(VAULT);
  console.log(`idle after  : ${after} (${Number(after) / 1e6} mUSDC)`);

  const ok = before >= 1_000_000n && result.invested && after === 0n;
  console.log(ok ? '\n✔ deposit→buy executed: idle invested to 0' : '\n✗ unexpected');
  if (!ok) process.exit(1);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
