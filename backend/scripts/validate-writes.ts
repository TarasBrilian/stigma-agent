/**
 * One-off LIVE WRITE validation — SPENDS testnet gas. Proves the ChainService
 * write path (TransactionV1 contract-call + secp256k1 signing + arg encoding) is
 * accepted and executes on-chain. Every call here is a deliberate near-no-op so
 * it does NOT disturb the smoke vault's state:
 *   - register(owner, vault) — already registered → idempotent no-op (Key args)
 *   - executeBuy(vault)      — idle mUSDC == 0 → returns early (no-arg trigger)
 *   - setPrice(mBTC, $65k)   — re-sets the current price (Key + U256 args)
 *   - rebalance(vault)       — holdings already at target → no swaps (no-arg trigger)
 *
 * Run from backend/ with the funded key (agent == deployer for the smoke vault):
 *   AGENT_SECRET_KEY_PATH=../contract/casper_account.pem \
 *   AGENT_TRIGGER_GAS_MOTES=60000000000 AGENT_WRITE_GAS_MOTES=10000000000 \
 *     npx ts-node --transpile-only scripts/validate-writes.ts
 *
 * Command-line env wins (dotenv does not override), so the agent key + gas above
 * apply; the rest (node URL, infra hashes) come from backend/.env.
 */
import 'reflect-metadata';
import 'dotenv/config';
import { ChainService } from '../src/chain/chain.service';

const VAULT =
  'hash-5e83185e1c3fc08d5d065f377c372c7df66de1f64ea9b213cc7f6ea39fa96a2e';
const OWNER =
  'account-hash-b9f3740ef94e78a56f86fa795a6fd136f432164e3c1915284bc2636b7cf933b8';

async function step(name: string, run: () => Promise<string>): Promise<void> {
  process.stdout.write(`\n→ ${name}\n`);
  const hash = await run();
  console.log(`   ✓ executed — tx ${hash}`);
}

async function main(): Promise<void> {
  const chain = new ChainService();
  await step('register(owner, vault) [idempotent no-op; Key args]', () =>
    chain.register(OWNER, VAULT),
  );
  await step('executeBuy(vault) [idle=0 no-op; agent trigger]', () =>
    chain.executeBuy(VAULT),
  );
  await step('setPrice(mBTC, $65k) [re-set current; Key+U256 args]', () =>
    chain.setPrice('mBTC', 65_000_000_000n),
  );
  await step('rebalance(vault) [at target → no swaps; agent trigger]', () =>
    chain.rebalance(VAULT),
  );
  console.log('\nAll writes accepted and executed on-chain ✔');
}

main().catch((e: Error) => {
  console.error(`\n✗ validation FAILED: ${e.message}`);
  process.exit(1);
});
