# Backend — TASK.md

Execution backlog for AI coding agents working in `backend/`. Read
[`../CLAUDE.md`](../CLAUDE.md) (golden rules) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
(design) **before** starting any task here — every task below cites the rule or
invariant it must not break.

The backend is the **linchpin of the demo**: it is the only module that talks to
Casper (`chain`) and the only one that calls OpenRouter (`agent`). The `chain`
integration is now **complete and live-verified on casper-test** — reads
(`viewState`/`getPrices`), writes (`executeBuy`/`rebalance`/`setPrice`/`register`/
`faucetMint`, all confirmed on-chain), the `register → POST /portfolios` wiring,
and the **deposit→buy** loop all work end to end. The remaining highest-leverage
work is the **rebalance→`RebalanceLog`** side of the loop (rationale + history),
**agent resilience** (no-OpenRouter fallbacks), and the **DB-backed flows**
(which need a running Postgres) — see §1 below for what's left at P0.

## How to read this file

- **Priority:** `P0` = blocks the end-to-end demo (deposit → buy → rebalance);
  `P1` = needed for a robust/representative demo; `P2` = production hardening.
- Tasks are ordered by the **critical path to a working demo** — do them top-down.
- `ref:` points at the file/line to change. `done:` is the acceptance criterion.
- `🔴` marks a golden-rule constraint the task must respect.

## Cross-layer critical path (where the backend sits)

```
contract: vault deployed + wired  ─┐
frontend: user signs deposit       ├─►  BACKEND keeper polls idle mUSDC ──► executeBuy (agent key)
                                   │     BACKEND keeper: prices ──► drift ──► rebalance (agent key)
backend reads (viewState/getPrices)┘     BACKEND relays live state ──► frontend renders
```
`ChainService` is real and live-verified; deposit→buy fires via the keeper's
idle-poll (not an event). What's left is the rebalance→log/rationale side and the
DB-backed flows below.

---

## 1. Critical path — make the demo work (P0)

### P0 · ChainService: reads (`viewState` + `getPrices`) — ✅ DONE
Everything downstream (portfolio display, keeper decision, projection, chat
snapshot) depends on these two reads. Implement them first.
- [x] Instantiate `casper-js-sdk` `RpcClient(new HttpHandler(CASPER_NODE_URL))` once, here only.
      ref: `src/chain/chain.service.ts` (lazy `client()` singleton); config in `src/chain/casper.config.ts`  🔴 golden rule #2 (chain access lives ONLY in this module)
- [x] Implement `viewState(vaultHash)`: read the vault's stored fields + holdings and
      assemble the `VaultState` interface.
      ref: `src/chain/chain.service.ts` (`viewState`); decoders in `src/chain/odra.codec.ts`
      done: ✅ VERIFIED LIVE on casper-test against vault `hash-5e83185e…` — `chain.live.spec.ts`
      (opt-in via `LIVE_VAULT_HASH`) asserts the decoded owner/agent/profile/base/holdings/config
      match the on-chain state (mUSDC 0 · mBTC 30769 · mNVDAx 30000000 · mXAUT 2000000 · mGOOGLx 6666666).
      NOTE: Casper 2.0 has NO off-chain view-call, so `view_state()` cannot be invoked for its
      return value. Instead each stored `Var`/`Mapping` is read from the Odra "state" dictionary
      + CEP-18 `balances` dict; the identical read path is verified live via `getPrices`.
- [~] Use the **on-chain** `createdYear` / `currentTargetAllocation` from `view_state`;
      do not recompute the glide target locally.
      ref: `src/portfolio/portfolio.service.ts:85` (DB mirror set independently) — in `get()`/`list()` surface `created_year` from `view_state`, treat the DB value as a mirror only
      🔴 golden rule #5 (don't re-implement the glide target)
      ⚠️ FORCED DEVIATION: `createdYear` IS read on-chain, but `currentTargetAllocation` CANNOT be
      (no off-chain view-call on Casper). It is recomputed in `src/chain/glide.ts`, a faithful,
      test-pinned mirror of `constants.rs` (`glide.spec.ts` uses the EXACT Rust vectors), so the
      rule's INTENT — one definition, no drift — is preserved. Still TODO: `portfolio.service`
      `get()/list()` surfacing `createdYear` from `viewState` (today still the DB mirror).
- [x] Implement `getPrices()`: read all 5 oracle prices into `Record<AssetSymbol, bigint>` (raw 6 dp).
      ref: `src/chain/chain.service.ts` (`getPrices`)
      done: ✅ VERIFIED LIVE on casper-test — mUSDC $1 · mBTC $65k · mNVDAx $100 · mXAUT $2k · mGOOGLx $150.

### P0 · ChainService: agent writes (`executeBuy` + `rebalance`)
- [x] Load the agent hot key from `AGENT_SECRET_KEY_PATH`; sign with it.
      DONE: `signer()` lazily loads the PEM (algorithm auto-detected from the header — Casper EC keys
      are secp256k1, else ed25519) and caches it; never logged or returned (golden #8).
      ref: `src/chain/chain.service.ts` (`signer`)
- [x] Implement `executeBuy(vaultHash)` and `rebalance(vaultHash)` — call the vault
      entry points with the agent key; pass **no amounts** (derived in-contract).
      DONE: both route through a shared `call()` (TransactionV1 contract-call by package hash,
      built/signed/submitted via casper-js-sdk v5). Routing + arg construction unit-tested
      (`chain.write.spec.ts`); errors propagate (don't swallow). `chain.module` unchanged.
      ref: `src/chain/chain.service.ts` (`executeBuy`/`rebalance`/`call`)
- [x] **(a) Live-validate the writes on testnet — ✅ VERIFIED.** Ran all four writes against the
      smoke vault `hash-5e83185e…` with the funded key (`AGENT_SECRET_KEY_PATH=../contract/casper_account.pem`,
      agent == deployer), each a deliberate near-no-op; all accepted + executed on-chain — proving
      TransactionV1 by package hash + secp256k1 signature + arg encoding (Key + U256) are all correct:
      register `d9ab3557…` · execute_buy `fe6591d2…` · set_price `8474231115…` · rebalance `0d933a10…`.
      `call()` now WAITS for finalization and THROWS on an on-chain revert, so a failed swap leg / guard
      surfaces (no silent success). Tool: `scripts/validate-writes.ts` (spends gas). NOTE: `rebalance`
      moved integer dust, so `chain.live.spec.ts` asserts the value-based target invariant (mUSDC 0 +
      each asset at its target share ±$20), not exact balances.
      🔴 golden rule #8 (never log/return the key) · #4 (no withdraw/fund-moving call with it)
      STILL TODO (separate, needs Postgres): the FULL keeper path — `POST /keeper/rebalance/:vault`
      → billing fee → `chain.rebalance` → agent rationale → `RebalanceLog` row.

### P0 · Vault creation & registration path (align with frontend + contract)
A vault must exist before any deposit/buy. Decide and implement the creation path
consistently across layers; today only the off-chain metadata mirror exists.
- [x] Agree the path with frontend + contract: **user-signed** vault deploy vs
      **backend-deployed** (add `chain.deployVault` with the deployer/agent key).
      DECIDED: **user-signed `Vault` deploy + backend-signed `register`** — see
      [`../../docs/decisions/0001-vault-creation-path.md`](../../docs/decisions/0001-vault-creation-path.md).
      The user becomes deployer + `owner`; the backend calls the permissionless,
      fund-free `register` (NOT the agent key) using the vault address the frontend
      reports. `chain.deployVault` is the documented FALLBACK only, not the accepted path.
- [x] Add `chain.register(owner, vault)` — a permissionless, no-funds call — and wire it into
      the `POST /portfolios` handler.
      DONE: `chain.register` (registry `register`; `owner` = `Key::Account`, `vault` = `Key::Hash`)
      is live-validated on testnet (tx `d9ab3557…`). **(b)** `PortfolioService.register` now calls it
      from the `POST /portfolios` handler, then saves the `PortfolioMeta` mirror. Best-effort: register
      is idempotent and the UI reads the mirror + live chain state, so a transient failure (key/network)
      is logged and the mirror is still written (operator can re-register) — covered by
      `portfolio.service.spec.ts` ("still mirrors if the on-chain register fails"). The `owner` the
      frontend reports is normalized to the vault's account-hash `Address` (`accountKey()` accepts an
      `account-hash-…` string OR a raw public-key hex). No agent-key fund path.
      ref: `src/chain/chain.service.ts` (`register`/`accountKey`); `src/portfolio/portfolio.service.ts` (handler)
      done: a created vault is registered on-chain + mirrored in Postgres; `GET /portfolios?owner=` lists it ✓
      🔴 golden rule #4 (deploying/registering a vault is fine; never put the agent key on a withdraw/fund-moving path)

### P0 · Deposit → buy flow — ✅ DONE (polling)
- [x] Surface uninvested deposits from the **`chain`** module so the keeper can act.
      Chose POLLING over CSPR.cloud event streaming: `chain.idleMusdc(vault)` reads the
      vault's mUSDC balance (one dict read, same proven read path as `getPrices`). It needs
      no CSPR.cloud AND also catches the cash a partial `withdraw` leaves behind (a
      `Deposited` event subscription would miss that). CSPR.cloud Streaming
      (`CSPR_CLOUD_API_KEY`) remains the production upgrade for real-time / lower-poll.
      ref: `src/chain/chain.service.ts` (`idleMusdc`)  🔴 golden rule #2 (chain access stays here)
- [x] Handle it in the keeper: `scanAndInvest` cron (every 5 min) → `investIdle(vault)` calls
      `chain.executeBuy` when idle clears the min-trade threshold, behind the `inFlight` lock.
      Idempotent by construction: `executeBuy` invests ALL idle, so an overlapping scan /
      redelivery sees idle == 0 and no-ops (no double-buy); the lock is shared with rebalance
      so the two never run on one vault at once. Manual `POST /keeper/invest/:vault` for demos.
      Covered by `keeper.service.spec.ts` (threshold, dust-skip, in-flight idempotency).
      ref: `src/keeper/keeper.service.ts` (`scanAndInvest`/`investIdle`); `keeper.controller.ts`
      🔴 golden rule #6 (idempotency lock)
      done: after a deposit the scan/endpoint invests idle with no manual `executeBuy`; redelivery
      does not double-buy ✓.
      ✅ LIVE-VERIFIED end-to-end on casper-test: funded the vault with $50 idle mUSDC
      (`VAULT_FUND` mode of the contract runner: faucet→approve→deposit, no buy), then
      `keeper.investIdle` read idle = 50_000_000, cleared the threshold, and called `executeBuy`
      (tx `d6dc9293…`) — idle returned to 0 and holdings grew by exactly the Moderate target
      (mBTC +$10 · mNVDAx +$15 · mXAUT +$20 · mGOOGLx +$5). Tools: `bin/deploy_vault.rs` `VAULT_FUND`,
      `backend/scripts/validate-invest.ts`.

### P0 · Keeper rebalance → `RebalanceLog` (the rebalance side of the loop)
`triggerRebalance` already wires `viewState`/`getPrices` → `decideRebalance` →
`billing.chargeRebalanceFee` → `chain.rebalance` (live ✓) → `agent.explainRebalance`
→ write `RebalanceLog`. It has NEVER completed end-to-end because (a)
`agent.explainRebalance` THROWS without an OpenRouter key (no fallback, unlike
`profileRisk`), aborting the trigger before the log is written, and (b) the
`RebalanceLog` write needs a running Postgres.
- [x] Make `agent.explainRebalance` (and `agent.answer`) RESILIENT: on OpenRouter
      failure/absence, fall back instead of throwing — mirror the `profileRisk` pattern.
      DONE: `explainRebalance` falls back to `deterministicRationale(pre, post)` — a
      display-only summary of the biggest pre/post weight deltas (dust < 0.1% → "on
      target"); `answer` degrades to a fixed "assistant unavailable" reply. Both also
      fall back on an empty LLM reply. So the keeper rebalance and chat no longer break
      without `OPENROUTER_API_KEY`. Covered by `agent.service.spec.ts` (no-key paths) +
      `agent.parse.spec.ts` (`deterministicRationale` both branches).
      ref: `src/agent/agent.service.ts` (`explainRebalance`/`answer`); `src/agent/agent.parse.ts` (`deterministicRationale`)
      🔴 golden rule #1 (rationale is display-only, never an executed number) · #3 (LLM only in `agent`)
      done: `explainRebalance`/`answer` return a fallback (not a throw) with no `OPENROUTER_API_KEY` ✓
- [~] Run the full keeper rebalance end-to-end against Postgres: `POST /keeper/rebalance/:vault`
      (force) → fee → `chain.rebalance` → rationale → `RebalanceLog` row; confirm `GET
      /portfolios/:vault/activity` returns it. Needs Postgres + the funded agent key (gas).
      MOCKED INTEGRATION DONE: `keeper.service.spec.ts` (`triggerRebalance`) proves a forced
      rebalance completes WITHOUT `OPENROUTER_API_KEY` and persists a `RebalanceLog` with a
      non-empty deterministic rationale + the x402 receipt (chain/prisma/billing mocked, real agent).
      STILL TODO: the same against a RUNNING Postgres + funded agent key (real `RebalanceLog` row +
      `GET …/activity`).
      ref: `src/keeper/keeper.service.ts` (`triggerRebalance`); `prisma/schema.prisma` (`RebalanceLog`)
      🔴 golden rule #6 (keeper guards stay) · #7 (x402 only on rebalance)
      done: a forced rebalance persists a `RebalanceLog` with rationale; the activity endpoint shows it

### P0 · ChainService: demo writes (`setPrice` + `faucetMint`) + PriceLog
Demo controls must keep working (demo-readiness rule).
- [x] Implement `setPrice(token, priceUsd6)` and `faucetMint(owner, amountUsd6)`.
      DONE: `setPrice` → oracle `set_price(token, price)`; `faucetMint` → `mUSDC.faucet_mint(amount)`.
      Both routed through `call()`; routing unit-tested; live validation rides on task (a).
      ⚠️ FINDING: the contract `faucet_mint` mints to the CALLER (the signing key), NOT to `owner` —
      there is no recipient arg. So `faucetMint` funds the BACKEND account; to fund a USER's wallet
      for a deposit, the user signs `faucet_mint` in the frontend. `owner` is kept for the API shape
      only (logged as a warning). Revisit if the demo needs server-funded user wallets (would need a
      mint-then-transfer, or a frontend-signed faucet).
      ref: `src/chain/chain.service.ts` (`setPrice`/`faucetMint`)
- [x] Persist a `PriceLog` on every write with the correct `source`
      (`keeper` for the loop, `manual_override` for the demo endpoint).
      DONE: a shared `logPrice(token, priceUsd6, source)` helper writes a `PriceLog` row after
      each successful `chain.setPrice`. `feedOracle` (cron) logs `source: keeper` per token it
      pushes; `setOracleOverride` (`POST /keeper/oracle/override`) logs `source: manual_override`.
      The raw 6-dp price is stored as a USD-dollar `Decimal` via `money.usd6ToDecimal` (DB
      convention). NOTE: the enum value is `manual_override` (underscore), per `schema.prisma` —
      the old `manual-override` comment was misleading and is removed. No schema change → no new
      migration. Covered by `keeper.service.spec.ts` (cron writes 5 `keeper` rows; override writes
      one `manual_override` row, asserting the dollar-Decimal conversion 65_000_000_000 → "65000").
      ref: `src/keeper/keeper.service.ts` (`logPrice`/`feedOracle`/`setOracleOverride`); `prisma/schema.prisma` (`PriceLog`, `PriceSource`)
      done: `POST /keeper/oracle/override` writes a `manual_override` row; the cron writes `keeper` rows ✓

### P0 · Fix the contract-hash env drift (factory → registry) — ✅ DONE
The contract deploys a `VaultRegistry`, but the backend env still names a factory.
- [x] Rename `VAULT_FACTORY_HASH` → `VAULT_REGISTRY_HASH` and load the value from
      `../../contract/deployed.casper-test.json`.
      ref: `README.md` (env section) + `src/chain/casper.config.ts` (reads `VAULT_REGISTRY_HASH`); values in `.env` / new `.env.example`
      done: ✅ backend targets `hash-70bcab…f112e` (the deployed registry); no `FACTORY` symbol remains in code/env/README.
      (Frontend `lib/constants.ts` factory→registry drift is a SEPARATE task in `../../frontend/docs/TASK.md`.)

---

## 2. Production hardening (P1 / P2)

### P1 · PricingService.fetchPrices — real reference prices — ✅ DONE
- [x] Fetch CoinGecko (BTC, gold→`mXAUT`) + a stock source (NVDA→`mNVDAx`, GOOGL→`mGOOGLx`);
      `mUSDC` pinned to `1_000_000`. Return raw USD 6 dp. Map onto the canonical asset order.
      DONE: `fetchPrices` fetches CoinGecko `simple/price` (`bitcoin`→mBTC, `tether-gold`→mXAUT,
      keyless; optional `COINGECKO_API_KEY` demo header) and a keyed stock source (Twelve Data shape
      by default, `STOCK_API_URL`-overridable; NVDA→mNVDAx, GOOGL→mGOOGLx via `PRICE_API_KEY`),
      pins `mUSDC`=1_000_000, and returns raw USD 6 dp. Decimal→raw conversion is exact via the new
      `money.usdToUsd6` (no float). Both sources fetched concurrently with an 8s `AbortSignal.timeout`;
      malformed/missing prices and non-2xx responses THROW with a source label (never the keyed URL).
      This unblocks the keeper price-feed loop AND the `keeper` `PriceLog` rows (the feed no longer
      throws unconditionally). Covered by `pricing.service.spec.ts` (mapping, missing-key, non-OK,
      malformed) + `money.spec.ts` (`usdToUsd6`).
      ref: `src/pricing/pricing.service.ts` (`fetchPrices`/`fetchCryptoPrices`/`fetchStockPrices`); `src/config/money.ts` (`usdToUsd6`)
      done: `feedOracle` cron pushes real prices (logged `source = keeper`); no longer hits the catch/skip ✓
      note: `feedOracle`'s try/catch is KEPT — a price-source outage throws here and the loop skips the cycle
      (it does NOT push a stale price). STILL NEEDS: a real `PRICE_API_KEY` provisioned to push live.

### P1 · Chat: snapshot from live state (not just the DB mirror) — ✅ DONE
- [x] Build the chat snapshot from live `chain.viewState` + `getPrices` merged with the mirror.
      DONE: `ChatService` injects `ChainService`; `buildSnapshot` enriches the mirror
      (name/profile/goal) with LIVE state — `currentValueUsd`, `currentAllocationPct`,
      `targetAllocationPct` — in HUMAN-READABLE units ($ and %, not raw 6dp/bps) so the LLM
      answers correctly instead of fumbling raw integers (display-only conversions; executed
      amounts stay bigint). RESILIENT: if the live read fails, it degrades to the mirror-only
      snapshot (logged) so chat still answers. (The no-OpenRouter `agent.answer` fallback is the
      rebalance agent-resilience task above.) Covered by `chat.service.spec.ts` (enrich, live-read
      fallback, not-found).
      ref: `src/portfolio/chat.service.ts` (`buildSnapshot`); `src/chain/chain.service.ts` (`viewState`)
      🔴 golden rule #3 (read live state via `chain`; the LLM stays in `agent`)
      done: an answer can reference the portfolio's current value/holdings, not only name/profile/goal ✓

### P1 · API authentication & authorization — ✅ DONE
- [x] Add wallet-signature auth (verify the caller controls `owner`) for onboarding/register/chat.
      DONE: shared authentication (`src/auth/wallet-auth.guard.ts`) checks `x-casper-timestamp` is
      fresh (replay window `AUTH_MAX_SKEW_SEC`, default 300s) + verifies a Casper signature over
      `stigma-auth:<ts>` with the caller's public key (casper-js-sdk `verifySignature` — verified for
      ed25519 + secp256k1; throws → treated as invalid). Authorization is split into TWO guards so the
      owner source can't be spoofed: `WalletAuthGuard` (register `POST /portfolios`, onboarding
      `POST /onboarding/answers`) requires the signer to BE `body.owner`; `VaultOwnerGuard` (chat
      `POST /agent/chat`) authorizes against the vault's STORED owner (mirror lookup) and deliberately
      IGNORES any `body.owner` — closing a bypass where a caller could read another user's vault by
      adding their own `owner` to the chat body (the guard reads the raw body, pre-whitelist).
      FEATURE-FLAGGED: a no-op unless `AUTH_REQUIRED=true`, so the live demo keeps working until the
      frontend signs (flip on in prod). Never touches the agent key / moves funds (#4/#8).
      Covered by `wallet-auth.guard.spec.ts` (no-op, valid, missing-headers, stale-ts, bad-sig,
      owner-mismatch; vault hit/miss + the body.owner-ignored bypass test, mutation-verified) +
      `app.boot.spec.ts` (both guards resolve at runtime).
      ref: `src/auth/wallet-auth.guard.ts`; controllers in `portfolio`/`onboarding`
- [x] Gate or rate-limit the demo endpoints so the oracle override can't be abused
      to move every vault's accounting.
      DONE: chose RATE-LIMIT (keeps the demo open, no token to distribute). `@nestjs/throttler`
      `ThrottlerModule.forRoot` (budget `DEMO_RATE_TTL_MS`/`DEMO_RATE_LIMIT`, default 30/60s) + a
      `ThrottlerGuard` on `KeeperController` (the 4 demo endpoints: oracle override, rebalance-now,
      invest, faucet). `app.boot.spec.ts` boots the real app and asserts a 429 once the budget is spent.
      ref: `src/keeper/keeper.controller.ts`; `src/app.module.ts`
      done: a caller cannot register/mutate a portfolio for an `owner` they don't control ✓ (when AUTH_REQUIRED=true)
      NOTE: frontend must sign requests (send `x-casper-public-key`/`-signature`/`-timestamp`) before
      enabling `AUTH_REQUIRED` — tracked in `../../frontend/docs/TASK.md`.

### P1 · x402 — real rebalance micro-fee
- [ ] Integrate the x402 facilitator (`X402_FACILITATOR_URL`); settle the fee in `mUSDC`;
      store the real receipt on `RebalanceLog.x402Receipt`.
      ref: `src/billing/billing.service.ts:25` (replaces the placeholder receipt)
      🔴 golden rule #7 (x402 ONLY on rebalance — do not gate other endpoints)
      done: a rebalance pulls the fee and persists a real receipt id

### P1 · Agent-key & secrets hygiene — ✅ DONE
- [x] Load the key only from `AGENT_SECRET_KEY_PATH`; assert `secrets/` and `.env` are gitignored (they are — keep it so).
      🔴 golden rule #8 · ref: `../ARCHITECTURE.md` §8
      DONE — two layers: (1) the CI workflow's "Assert no secrets are committed" step fails if any
      `.env`/`.pem`/`secrets/` file is tracked or a PEM private-key header appears in tracked content
      (only `*.env.example` templates are tracked). (2) `chain.read.spec.ts` (#8) runs a real write with
      an in-memory key and asserts the agent key's secret hex never appears in any log line. The key is
      loaded only from `AGENT_SECRET_KEY_PATH` (`signer`), cached, and never logged or returned.
      ref: `.github/workflows/backend.yml`; `src/chain/chain.read.spec.ts`
      done: key never appears in logs, responses, or errors; CI/grep check for accidental leakage ✓

### P1 · Populate `RebalanceLog.swaps` (currently always `[]`)
- [ ] Once per-leg swap data is on-chain, fill `swaps` from indexed `Router.Swapped`
      events instead of writing `[]`.
      ref: `src/keeper/keeper.service.ts:118` (`swaps: []`); `../../contract/docs/TASK.md` (emit/index events)
      done: a rebalance log shows real per-asset deltas in the activity view

### P2 · Projection precision
- [ ] Replace `number` compound-interest math with a decimal/bigint library (e.g. `decimal.js`).
      ref: `src/pricing/pricing.service.ts:46` (documented `number` use — display-only, never executed)

### P2 · `ProjectionCache` — populate or remove (schema/code drift)
The `ProjectionCache` model exists in `prisma/schema.prisma` but is NOT written or
read anywhere in `src/` — the projection is recomputed live each request
(`pricing.service.projectContribution`), per the architecture's "recompute live"
choice. Resolve the dead-model inconsistency.
- [ ] Either persist the last projection into `ProjectionCache` on each `projection()`
      call (serve it as a fast/fallback read), OR drop the model from the schema and note
      that the projection is intentionally always-live.
      ref: `prisma/schema.prisma` (`ProjectionCache`); `src/portfolio/portfolio.service.ts` (`projection`)
      done: no Prisma model is defined-but-unused; the projection's caching policy is explicit

### P2 · Agent-key production direction
- [ ] Track the move from a single hot key to Casper account-abstraction / session keys
      (scoped, revocable, spend-capped). Design note only until contracts support it.
      ref: `../../contract/ARCHITECTURE.md` §10

---

## 3. Tests & CI

### P0 · Keep the existing suite green
- [ ] `pnpm lint` + `pnpm test` pass after every task (specs: `keeper.decideRebalance`,
      `money`, `portfolio` no-chain paths, `agent.parse`, DI smoke).
      ref: `src/**/*.spec.ts`

### P1 · Cover the new chain wiring
- [x] Unit-test `ChainService`: write routing + arg construction (`chain.write.spec.ts`),
      `accountKey` (`chain.service.spec.ts`), and a LIVE decode cross-check
      (`chain.live.spec.ts`, opt-in).
      DONE: `chain.read.spec.ts` adds a mocked-RPC encode→decode round-trip — wire bytes are
      built from first principles (Casper `bytesrepr`: U256/U32/Address/Vec<U32>/profile, the
      Odra List(U8) state-wrap, native CEP-18 U256) and fed through a fake `RpcClient`, then
      `getPrices`/`viewState` are asserted to decode them back to the originals (also covers the
      Casper -32003 → 0 path and that a NON -32003 RPC error propagates, never masked as 0).
      It also asserts golden rule #4 (no withdraw/transfer/fund-moving method on the prototype;
      vault writes are exactly `executeBuy`/`rebalance`) and golden rule #8 (a write logs the tx
      hash but never the agent key — generated in-memory, secret hex asserted absent from logs).
      ref: `src/chain/chain.read.spec.ts`
- [x] Integration test: deposit → `executeBuy` updates holdings; redelivery is idempotent.
      DONE: idempotency unit-tested (`keeper.service.spec.ts` in-flight lock) + LIVE-VERIFIED
      end-to-end (fund $50 idle → `investIdle` → `executeBuy` → idle 0; see the deposit→buy section).
- [ ] Integration test: `triggerRebalance(force)` end-to-end writes a `RebalanceLog` with rationale +
      receipt — tracked as the **P0 · Keeper rebalance → `RebalanceLog`** task above (needs Postgres).

### P1 · CI pipeline — ✅ DONE
- [x] Add `.github/workflows/backend.yml`: `pnpm install`, `pnpm prisma generate`,
      `pnpm lint`, `pnpm test`.
      DONE: `.github/workflows/backend.yml` runs on `pull_request` + `push` to `main` filtered to
      `backend/**` (and the workflow file). Steps: checkout → "Assert no secrets are committed"
      (golden #8 backstop) → pnpm 9 + Node 22 (pnpm cache) → `pnpm install --frozen-lockfile` →
      `pnpm prisma generate` → `pnpm lint:check` → `pnpm test` → `pnpm build`. Uses a new
      `lint:check` script (eslint WITHOUT `--fix`, `--max-warnings 0`) so CI CATCHES lint/format
      issues instead of silently auto-fixing them. Tests are unit-only/mocked, so no Postgres
      service is provisioned. Every step verified locally (secrets-check no-match, frozen install OK,
      lint:check exit 0, 78 tests pass, build exit 0; YAML validated).
      ref: `.github/workflows/backend.yml`; `backend/package.json` (`lint:check`)
      done: CI runs on PRs touching `backend/` ✓

---

## Definition of done (per task)
- `pnpm lint` + `pnpm test` pass; a migration is created if the schema changed.
- No golden rule (1–8) violated — re-check the `🔴` lines.
- Chain access only via `chain`; OpenRouter only via `agent`; bands/return
  assumptions stay in `src/config/constants.ts`.
- Demo endpoints still work (faucet, oracle override, rebalance-now) and the
  rebalance rationale is still persisted and returned.
