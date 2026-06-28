# Backend — TASK.md

Execution backlog for AI coding agents working in `backend/`. Read
[`../CLAUDE.md`](../CLAUDE.md) (golden rules) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
(design) **before** starting any task here — every task below cites the rule or
invariant it must not break.

The backend is the **linchpin of the demo**: it is the only module that talks to
Casper (`chain`) and the only one that calls OpenRouter (`agent`). Today the
`chain` integration is a stub, so most live-state endpoints throw. Filling it is
the highest-leverage work in the whole repo.

## How to read this file

- **Priority:** `P0` = blocks the end-to-end demo (deposit → buy → rebalance);
  `P1` = needed for a robust/representative demo; `P2` = production hardening.
- Tasks are ordered by the **critical path to a working demo** — do them top-down.
- `ref:` points at the file/line to change. `done:` is the acceptance criterion.
- `🔴` marks a golden-rule constraint the task must respect.

## Cross-layer critical path (where the backend sits)

```
contract: vault deployed + wired  ─┐
frontend: user signs deposit       ├─►  BACKEND observes Deposited ──► executeBuy (agent key)
                                   │     BACKEND keeper: prices ──► drift ──► rebalance (agent key)
backend reads (viewState/getPrices)┘     BACKEND relays live state ──► frontend renders
```
Nothing renders live value and no agent action fires until `ChainService` is real.

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
      done: decode unit-tested (`odra.codec.spec.ts`); FULL live e2e pending a deployed vault (none on testnet yet — `mUSDC.total_supply == 0`).
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
- [ ] Load the agent hot key from `AGENT_SECRET_KEY_PATH` at startup; sign deploys with it.
      ref: `src/chain/chain.service.ts:53,58`
      🔴 golden rule #8 (never log or return the agent key) · #4 (never construct a withdraw/fund-moving deploy with it)
- [ ] Implement `executeBuy(vaultHash)` and `rebalance(vaultHash)` — call the vault
      entry points with the agent key; pass **no amounts** (derived in-contract).
      done: `POST /keeper/rebalance/:vault` executes on testnet and a `RebalanceLog` row is written
- [ ] Confirm a failed swap leg surfaces (don't swallow); a failed guard aborts the trigger.
      ref: `../CLAUDE.md` "Errors"

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
- [ ] Add `chain.register(owner, vault)` — a permissionless, no-funds call (no agent
      key required). There is **no chain event to observe a vault deploy** (`init`
      emits nothing; `VaultRegistered` only fires *from* `register`), so the frontend
      reports the new vault address via `POST /portfolios`; call `register` from that
      handler, then save the off-chain `PortfolioMeta` mirror in the same handler.
      ref: `../../contract/src/registry.rs:28` (on-chain registry); `src/portfolio/portfolio.service.ts:65` (off-chain `POST /portfolios` handler)
      done: a created vault is on-chain, in the registry, and mirrored in Postgres; `GET /portfolios?owner=` lists it
      🔴 golden rule #4 (deploying/registering a vault is fine; never put the agent key on a withdraw/fund-moving path)

### P0 · Deposit → buy event flow (currently MISSING — no listener exists)
The architecture's deposit→buy is event-driven, but there is **no event
subscription anywhere** in `src/`. Without it, deposits never get invested.
- [ ] Expose the vault `Deposited` event stream from the **`chain`** module (CSPR.cloud
      Streaming; `CSPR_CLOUD_API_KEY`), or poll as a fallback.
      ref: `../ARCHITECTURE.md` §6 (Deposit → buy); `src/chain/chain.service.ts`  🔴 golden rule #2 (Casper/CSPR.cloud access stays in `chain`)
- [ ] Handle the stream in the keeper: on `Deposited`, call `chain.executeBuy(vault)` keyed by deploy/event id for idempotency.
      🔴 golden rule #6 (idempotency lock — reuse the `inFlight` pattern, key by event id)
      done: after a user deposit, holdings show bought assets with no manual trigger; redelivery does not double-buy

### P0 · ChainService: demo writes (`setPrice` + `faucetMint`) + PriceLog
Demo controls must keep working (demo-readiness rule).
- [ ] Implement `setPrice(token, priceUsd6)` and `faucetMint(owner, amountUsd6)`.
      ref: `src/chain/chain.service.ts:48,63`
- [ ] Persist a `PriceLog` on every write with the correct `source`
      (`keeper` for the loop, `manual_override` for the demo endpoint).
      ref: `src/keeper/keeper.service.ts:47,131`; `prisma/schema.prisma` (`PriceLog`, `PriceSource`)
      done: `POST /keeper/oracle/override` writes a `manual_override` row; the cron writes `keeper` rows

### P0 · Fix the contract-hash env drift (factory → registry) — ✅ DONE
The contract deploys a `VaultRegistry`, but the backend env still names a factory.
- [x] Rename `VAULT_FACTORY_HASH` → `VAULT_REGISTRY_HASH` and load the value from
      `../../contract/deployed.casper-test.json`.
      ref: `README.md` (env section) + `src/chain/casper.config.ts` (reads `VAULT_REGISTRY_HASH`); values in `.env` / new `.env.example`
      done: ✅ backend targets `hash-70bcab…f112e` (the deployed registry); no `FACTORY` symbol remains in code/env/README.
      (Frontend `lib/constants.ts` factory→registry drift is a SEPARATE task in `../../frontend/docs/TASK.md`.)

---

## 2. Production hardening (P1 / P2)

### P1 · PricingService.fetchPrices — real reference prices
- [ ] Fetch CoinGecko (BTC, gold→`mXAUT`) + a stock source (NVDA→`mNVDAx`, GOOGL→`mGOOGLx`);
      `mUSDC` pinned to `1_000_000`. Return raw USD 6 dp. Map onto the canonical asset order.
      ref: `src/pricing/pricing.service.ts:32` (replaces the `throw`)
      done: `feedOracle` cron pushes real prices (logged `source = keeper`); no longer hits the catch/skip
      note: keep `feedOracle`'s try/catch — a price-source outage must not crash the loop

### P1 · API authentication & authorization (none today)
Every endpoint is open; `register` trusts any `owner`, and demo endpoints (faucet,
oracle override, rebalance-now) are unauthenticated and powerful.
- [ ] Add wallet-signature auth (verify the caller controls `owner`) for onboarding/register/chat.
      ref: `src/main.ts:9` (CORS only today); `src/portfolio/portfolio.controller.ts`
- [ ] Gate or rate-limit the demo endpoints so the oracle override can't be abused
      to move every vault's accounting.
      ref: `src/keeper/keeper.controller.ts`
      done: a caller cannot register/mutate a portfolio for an `owner` they don't control

### P1 · x402 — real rebalance micro-fee
- [ ] Integrate the x402 facilitator (`X402_FACILITATOR_URL`); settle the fee in `mUSDC`;
      store the real receipt on `RebalanceLog.x402Receipt`.
      ref: `src/billing/billing.service.ts:25` (replaces the placeholder receipt)
      🔴 golden rule #7 (x402 ONLY on rebalance — do not gate other endpoints)
      done: a rebalance pulls the fee and persists a real receipt id

### P1 · Agent-key & secrets hygiene
- [ ] Load the key only from `AGENT_SECRET_KEY_PATH`; assert `secrets/` and `.env` are gitignored (they are — keep it so).
      ref: `../ARCHITECTURE.md` §8 · 🔴 golden rule #8
      done: key never appears in logs, responses, or errors; CI/grep check for accidental leakage

### P1 · Populate `RebalanceLog.swaps` (currently always `[]`)
- [ ] Once per-leg swap data is on-chain, fill `swaps` from indexed `Router.Swapped`
      events instead of writing `[]`.
      ref: `src/keeper/keeper.service.ts:118` (`swaps: []`); `../../contract/docs/TASK.md` (emit/index events)
      done: a rebalance log shows real per-asset deltas in the activity view

### P2 · Projection precision
- [ ] Replace `number` compound-interest math with a decimal/bigint library (e.g. `decimal.js`).
      ref: `src/pricing/pricing.service.ts:46` (documented `number` use — display-only, never executed)

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
- [ ] Unit-test `ChainService` with a mocked RPC: CLValue encode/decode round-trips for
      `viewState`/`getPrices`; assert no withdraw deploy can be constructed with the agent key.
      ref: `src/chain/chain.service.ts`
- [ ] Integration test: deposit → (event) → `executeBuy` updates holdings; redelivery is idempotent.
- [ ] Integration test: `triggerRebalance(force)` end-to-end writes a `RebalanceLog` with rationale + receipt.

### P1 · CI pipeline (none exists)
- [ ] Add `.github/workflows/backend.yml`: `pnpm install`, `pnpm prisma generate`,
      `pnpm lint`, `pnpm test`. (No `.github/` directory exists yet.)
      done: CI runs on PRs touching `backend/`

---

## Definition of done (per task)
- `pnpm lint` + `pnpm test` pass; a migration is created if the schema changed.
- No golden rule (1–8) violated — re-check the `🔴` lines.
- Chain access only via `chain`; OpenRouter only via `agent`; bands/return
  assumptions stay in `src/config/constants.ts`.
- Demo endpoints still work (faucet, oracle override, rebalance-now) and the
  rebalance rationale is still persisted and returned.
