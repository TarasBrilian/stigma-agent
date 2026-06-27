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
- [ ] Provide a vault-deploy runner (Odra livenet runner or a `casper-client`
      script): deploy `Vault.wasm` with init args
      `(owner, agent, profile, base_allocation, target_amount_usd, target_year, oracle, router, assets[5])`,
      then call `VaultRegistry.register(owner, vault)`.
      ref: `scripts/deploy.sh:51-55`; `src/registry.rs:28` (`register`); `src/vault.rs:107` (`init`)
      🔴 golden rule #5 (init validates `Σ == 10000` + asset membership) · #2 (no agent-settable allocation)
      done: a vault is live on testnet; `VaultRegistry.list_vaults(owner)` includes it; `view_state` returns
- [ ] Decide with frontend/backend **who** signs the vault deploy (user-signed module
      bytes vs backend-deployed). Document it next to the runner.
      ref: `../ARCHITECTURE.md` §6 ("Vault creation itself is user-signed")

### P0 · Validate the deployed wiring actually executes a swap
The deploy record claims each token's `set_minter(router)` ran and the oracle is
seeded, but nothing has exercised a real swap on testnet. `execute_buy` /
`rebalance` / `withdraw` all revert if minting isn't wired.
- [ ] Run a smoke swap on testnet (router burns input, mints output) and a vault
      `execute_buy` against a faucet-funded owner.
      ref: `deployed.casper-test.json` (wiring claim); `src/router.rs:45` (`swap`); `src/token.rs:79` (`set_minter`)
      🔴 CLAUDE.md Gotcha (mint authority lives ONLY in the Router + `mUSDC.faucet_mint` — don't grant it elsewhere)
      done: a testnet swap succeeds; `execute_buy` deploys idle `mUSDC` into assets without reverting

### P0 · Export & propagate hashes (and kill the factory/registry drift)
The contract correctly produces `VAULT_REGISTRY_HASH`, but downstream still names
a factory — a silent mistarget waiting to happen.
- [ ] Make the deploy flow write/export hashes to `../backend/.env` and `../frontend/.env`
      using the **registry** name everywhere.
      ref: `scripts/deploy.sh:60-66`; drift lives downstream in `../backend/README.md:60`,
      `../frontend/lib/constants.ts:41`, `../frontend/.env.example:15`
      done: both env files carry `VAULT_REGISTRY_HASH` (= `hash-70bcab…f112e`); no `FACTORY` symbol remains anywhere
- [ ] Propagate the token hashes + `AGENT_PUBLIC_KEY` too: backend needs all five token hashes
      (`setPrice`/`faucet`) and the agent key; frontend needs at least `TOKEN_MUSDC_HASH` for the deposit `approve`.
      ref: `scripts/deploy.sh:62-64`; `deployed.casper-test.json` (`tokens`)
      done: backend `.env` has the 5 token hashes + `AGENT_PUBLIC_KEY`; frontend env has `TOKEN_MUSDC_HASH`

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
