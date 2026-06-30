# Contracts — TASK.md

Execution backlog for AI coding agents working in `contract/`. Read
[`../CLAUDE.md`](../CLAUDE.md) (golden rules — "this is law") and
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) (full spec) **before** changing any
contract. Every task cites the rule/invariant it must not break.

This is the **most complete layer**: all five modules are implemented, unit- and
integration-tested on OdraVM, and the shared infra is **already deployed to
testnet** (`deployed.casper-test.json`). The remaining work is making per-vault
deployment reproducible, aligning events with what the backend needs to index,
and validating on a real Casper backend — plus production-swap hardening.

## How to read this file

- **Priority:** `P0` = blocks the end-to-end demo (a vault must exist + be wired
  before deposit→buy→rebalance can run); `P1` = robust demo / spec alignment;
  `P2` = production hardening.
- Tasks are ordered by the **critical path to a working demo**.
- `ref:` = file to change. `done:` = acceptance criterion. `🔴` = golden rule.
- **No floats anywhere. Integer bps math only.** (`../CLAUDE.md` Conventions.)

## Cross-layer critical path (where the contracts sit)

```
CONTRACT: infra deployed ✓ ─► per-vault deploy + registry.register ─► vault exists on testnet
                                              │
backend reads view_state ◄────────────────────┘
backend agent key ─► execute_buy / rebalance (amounts derived in-contract)
backend indexes events (Deposited / Swapped) ─► RebalanceLog
```
The contracts are done; the gap is *operational* (deploying a vault, exporting
hashes) and *observability* (events the backend can index).

---

## 1. Critical path — make the demo work (P0)

### P0 · Per-vault deploy path (today only shared infra is deployable)
`scripts/deploy.sh` builds WASM and prints the plan for tokens/oracle/router/
registry, but there is **no reproducible way to deploy a `Vault` per user and
register it** — yet a vault must exist before any deposit/buy/rebalance.
- [x] Provide a vault-deploy runner (Odra livenet runner or a `casper-client`
      script): deploy `Vault.wasm` with init args
      `(owner, agent, profile, base_allocation, target_amount_usd, target_year, oracle, router, assets[5])`,
      then call `VaultRegistry.register(owner, vault)`.
      DELIVERED: `bin/deploy_vault.rs` (Odra **livenet** runner, behind the `livenet`
      Cargo feature so the wasm build/tests never pull the host RPC client). It reuses
      the generated `VaultInitArgs`/HostRefs (no hand-encoded CLValues), reads the SAME
      infra-hash names from `deployed.casper-test.json` (env override), deploys the `Vault`,
      then calls the permissionless `VaultRegistry.register`. `cargo clippy`/`cargo fmt`
      clean; `cargo odra test` green.
      ✅ VERIFIED ON TESTNET (casper-test): vault
      `hash-5e83185e1c3fc08d5d065f377c372c7df66de1f64ea9b213cc7f6ea39fa96a2e` is live
      (deploy tx `a9de3d5c…`) and registered (tx `f3fef538…`); a gas-free `VAULT_READ`
      view confirms `list_vaults(owner) == true`.
      Run: `cargo run --bin deploy_vault --features livenet` (see file header / `README.md`).
      ref: `bin/deploy_vault.rs`; `scripts/deploy.sh` (now points here); `src/registry.rs:28`; `src/vault.rs:107`
      🔴 golden rule #5 (init validates `Σ == 10000` + asset membership) · #2 (no agent-settable allocation)
      done: a vault is live on testnet; `VaultRegistry.list_vaults(owner)` includes it ✓
- [x] Decide with frontend/backend **who** signs the vault deploy (user-signed module
      bytes vs backend-deployed). Document it next to the runner.
      DECIDED: **user-signed `Vault.wasm` module-bytes deploy** (user = deployer +
      `owner`); the backend then calls the permissionless `VaultRegistry.register`.
      See [`../../docs/decisions/0001-vault-creation-path.md`](../../docs/decisions/0001-vault-creation-path.md).
      The per-vault deploy runner above doubles as the runbook for this deploy
      (same init args/order) and for manual operator testing.
      ref: `../ARCHITECTURE.md` §6 ("Vault creation itself is user-signed")

### P0 · Validate the deployed wiring actually executes a swap
The deploy record claims each token's `set_minter(router)` ran and the oracle is
seeded, but nothing has exercised a real swap on testnet. `execute_buy` /
`rebalance` / `withdraw` all revert if minting isn't wired.
- [x] Run a smoke swap on testnet (router burns input, mints output) and a vault
      `execute_buy` against a faucet-funded owner.
      DELIVERED: the runner's `VAULT_SMOKE=1` step does this end to end — `faucet_mint`
      → `approve` → `deposit` → `execute_buy` driven by the single deployer key
      (owner==agent==deployer guard), exiting non-zero if any leg reverts.
      ✅ VERIFIED ON TESTNET: deposited $10,000 mUSDC; `execute_buy` (tx `501edd3f…`)
      swapped it into the 4 assets at the EXACT Moderate target — a gas-free `VAULT_READ`
      shows holdings mUSDC 0 · mBTC 30769 ($2k=20%) · mNVDAx 30000000 ($3k=30%) · mXAUT
      2000000 ($4k=40%) · mGOOGLx 6666666 ($1k=10%), total $10k conserved. This proves
      `set_minter(router)` is wired and the oracle is seeded.
      ref: `bin/deploy_vault.rs` (`smoke`/`verify`); `src/router.rs:45` (`swap`); `src/token.rs:79` (`set_minter`)
      🔴 CLAUDE.md Gotcha (mint authority lives ONLY in the Router + `mUSDC.faucet_mint` — don't grant it elsewhere)
      done: a testnet swap succeeds; `execute_buy` deploys idle `mUSDC` into assets without reverting ✓

### P0 · Export & propagate hashes (and kill the factory/registry drift)
The contract correctly produces `VAULT_REGISTRY_HASH`, but downstream still names
a factory — a silent mistarget waiting to happen.
- [x] Make the deploy flow write/export hashes to `../backend/.env` and `../frontend/.env`
      using the **registry** name everywhere.
      DONE: factory drift killed downstream — `../frontend/lib/constants.ts` + `../frontend/.env.example`
      no longer reference any factory symbol; backend already uses `VAULT_REGISTRY_HASH`. `deploy.sh`
      EXPORT section lists the correct per-layer var sets (registry name for backend; no registry
      hash for frontend, per ADR 0001). NOTE: `deploy.sh` still *prints* the export plan rather than
      auto-writing the env files — on-chain submission stays manual (needs a funded key; can't run in CI).
      ref: `scripts/deploy.sh:57-73`; `../frontend/lib/constants.ts:35`, `../frontend/.env.example`
      done: both env files use the registry name (frontend needs none); no `FACTORY` symbol remains in code/env
- [x] Propagate the token hashes + `AGENT_PUBLIC_KEY` too. Backend needs all five token
      hashes (`setPrice`/`faucet`) and the agent key. The frontend's need is LARGER under
      ADR 0001 (user-signed vault deploy): to fill `Vault::init` args the UI needs
      `AGENT_PUBLIC_KEY`, the **oracle** hash, the **router** hash, and **all 5 asset token
      hashes** (`assets[5]`) — plus `TOKEN_MUSDC_HASH` for the deposit `approve` and the
      `Vault.wasm` bytes themselves (ship as a static asset). The frontend does **not** need
      `VAULT_REGISTRY_HASH` (the backend calls `register`; reads go via backend).
      ref: `scripts/deploy.sh:62-64`; `deployed.casper-test.json` (`tokens`, `oracle`, `router`);
      `../../docs/decisions/0001-vault-creation-path.md`; `../src/vault.rs:107` (init args)
      DONE (templates/accessors): backend `.env.example` already lists the 5 token hashes +
      `AGENT_PUBLIC_KEY`; frontend `.env.example` now lists `AGENT_PUBLIC_KEY` + oracle + router +
      5 token hashes (prefilled from `deployed.casper-test.json`, agent key placeholder), and
      `lib/constants.ts` exposes them. Real `.env` values are operator-supplied at deploy time.
      STILL TODO (builder task): make `Vault.wasm` fetchable by the UI (static asset/public path).
      done: backend `.env` has the 5 token hashes + `AGENT_PUBLIC_KEY`; frontend env has
      `AGENT_PUBLIC_KEY` + oracle + router + 5 token hashes, and `Vault.wasm` is fetchable by the UI

---

## 2. Events & spec alignment (P1)

### P1 · Emit events the backend can index into `RebalanceLog.swaps`
`RebalanceLog.swaps` is currently always `[]` because the vault emits only
aggregate events. ARCHITECTURE §8 promises "`Rebalanced` (with per-asset deltas)".
- [ ] Choose one: (a) **preferred, no contract change** — confirm `Router.Swapped`
      (per-leg) + `Vault.Deposited` are sufficient for the backend to reconstruct legs; or
      (b) enrich `Bought`/`Rebalanced` with per-asset deltas.
      ref: `src/vault.rs:49-57` (`Bought`/`Rebalanced`); `src/router.rs:23-30` (`Swapped`); `../ARCHITECTURE.md` §8
      🔴 CLAUDE.md Events convention (a state-changing fn must emit its event — keep events complete)
      done: the backend can populate `RebalanceLog.swaps` from on-chain events

---

## 3. Production hardening (P2)

### P2 · Per-leg partial fills (ARCHITECTURE §7 — not implemented)
The mock router prices off the same oracle, so a swap never misses `min_out`; real
slippage/partial-fill handling is a production concern.
- [ ] When swapping the mock layer for a real DEX, implement per-leg partial fills:
      a leg that can't meet `min_out` reverts that **leg**; `execute_buy`/`rebalance`
      continue with the rest. Access/invariant failures still abort the whole call.
      ref: `src/vault.rs:192,218` (`execute_buy`/`rebalance`); `README.md:56`; `../ARCHITECTURE.md` §7
      🔴 golden rule #3 (every swap still passes a hard `min_out`)

### P2 · Production swap-out (real oracle / router / tokens)
- [ ] Replace `PriceOracle` with a real oracle, the mock `Router` with a real DEX
      (or the CSPR.trade route), and mock tokens with real assets — vault logic and
      the owner/agent split stay unchanged.
      ref: `../ARCHITECTURE.md` §10
      🔴 golden rules 1, 2, 4 (owner-only withdraw, computed target, derived amounts) are invariant across this swap

### P2 · `withdraw(amount)` partial-withdraw behavior
- [ ] Revisit: a partial `withdraw` liquidates **all** holdings to `mUSDC`, sends
      `amount`, and leaves the remainder as idle cash until the next `execute_buy`.
      Either document this as intended or sell only what's needed.
      ref: `src/vault.rs:145-155` (`withdraw`), `:389-405` (`liquidate_to_musdc`)
      🔴 golden rule #1 (still owner-only; no agent path) — do not change the auth model

### P2 · Agent-key hardening direction
- [ ] Track the production path from a single agent key to account abstraction /
      session keys (scoped, revocable, spend-capped) — Casper-native.
      ref: `../ARCHITECTURE.md` §10 (design note only until supported)

---

## 4. Tests & CI

### P1 · Validate on a real Casper backend
- [ ] Run the suite against Casper, not just OdraVM, for block-time / glide timing:
      `cargo odra test -b casper`.
      ref: `src/tests.rs`; `../CLAUDE.md` Gotchas (block time ≈ 8s)
      done: `full_lifecycle_and_agent_cannot_withdraw` passes on `-b casper`

### P1 · Broaden unit coverage of the auth guards
Glide math is well covered; the mock modules' guards are not.
- [ ] Add tests: `MockToken` mint/burn is minter-only and `faucet_mint` is `mUSDC`-only;
      `PriceOracle.set_price` is keeper-only; `Router.swap` reverts below `min_out` and on zero amount.
      ref: `src/token.rs`, `src/oracle.rs`, `src/router.rs` (tests live in `src/tests.rs`)
- [ ] Add a vault test: `execute_buy` leaves the `mUSDC`-target portion as cash (does not swap `mUSDC`→`mUSDC`).
      ref: `src/vault.rs:203-213`

### P1 · CI pipeline (none exists)
- [ ] Add `.github/workflows/contract.yml`: `cargo odra build`, `cargo odra test`,
      `cargo fmt --check`, `cargo clippy -- -D warnings`. (No `.github/` directory exists yet.)
      ref: `../CLAUDE.md` Commands

---

## Definition of done (per task)
- `cargo odra test` and `cargo clippy` pass; `cargo fmt` clean.
- No golden rule (1–7) violated — re-check the `🔴` lines.
- Any new state-changing fn has the correct caller guard, a `min_out` if it swaps,
  and an emitted event; allocation invariants (`Σ == 10000`, asset membership) hold.
- If deployed: hashes exported to `../backend/.env` + `../frontend/.env` under the
  **registry** name.
