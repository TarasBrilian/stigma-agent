# CLAUDE.md — Contracts

Guidance for AI coding agents working in `contract/`. Read this before changing any contract. Design rationale is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope of this directory

The Casper on-chain layer (Rust + Odra → WASM): `Vault`, `VaultRegistry` (there is **no** `VaultFactory` — Casper can't deploy a contract from a contract; each `Vault` is deployed individually, see [ADR 0001](../docs/decisions/0001-vault-creation-path.md)), mock `PriceOracle`, mock `Router`, CEP-18 mock tokens. This is the **source of truth for money state** and the place the **glide-path target is computed**. The backend triggers actions and reads the computed target; the frontend reads state. Everything tradable here is **mocked** and **testnet-only** — intentionally.

## 🔴 Golden rules — do not violate

1. **`withdraw` is `owner`-only. The agent never withdraws.** The `agent` role may call `execute_buy` and `rebalance` and nothing else. Never add an agent-reachable path that transfers funds out of a vault or to an arbitrary address.
2. **No agent-settable allocation.** The current target allocation is **computed in-contract** from `profile` + `base_allocation` + `created_year` + `target_year` + block time. Do not add a `set_allocation` / `set_target` that the agent can call. Only `owner` may change config via `update_config`.
3. **Every `Router.swap` passes a hard `min_out`.** No swap without a slippage cap.
4. **`execute_buy` / `rebalance` derive all amounts internally** from on-chain balances + computed target. The caller (agent) supplies no amounts.
5. **Validate on every config write:** `sum(allocation) == 10000` and every token ∈ allowed asset set.
6. **Mock contracts stay isolated and obviously named.** `Vault` only reads price via `PriceOracle.get_price`; no mock logic bleeds into vault accounting.
7. **Only allowed assets are tradable.** Reject swaps/allocations involving unknown tokens.

If a request conflicts with these, flag it instead of implementing it.

## Layout

```
Cargo.toml      single crate (stigma_contracts) — NOT a workspace
src/vault.rs    Vault                 (the important one)
src/registry.rs VaultRegistry         (owner -> vaults; no factory)
src/token.rs    CEP-18 mock tokens (mUSDC + assets)
src/oracle.rs   PriceOracle (mock)
src/router.rs   Router (mock)
src/constants.rs glide math + asset/profile constants
src/tests.rs    OdraVM tests
scripts/        deploy + hash export
```

## Commands

```bash
cargo odra build            # compile WASM
cargo odra test             # unit tests on OdraVM (fast — default loop)
cargo odra test -b casper    # against a Casper backend (slower, closer to real)
cargo fmt && cargo clippy    # format + lint
./scripts/deploy.sh casper-test   # deploy in order: tokens -> oracle -> router -> registry
```

Run `cargo odra test` (and `clippy`) before considering a change done.

## Conventions

- **Units:** USD as fixed-point `u64`, 6 decimals; weights as bps (`u32`), Σ = 10000. **No floats anywhere.** Do rounding explicitly and renormalize so weights still sum to 10000.
- **Auth:** use Odra's caller/auth primitives — there is no Solidity `msg.sender`. Centralize the `owner` / `agent` checks in small guard helpers and reuse them.
- **CEP-18:** use the `odra-modules` implementation; don't hand-roll a token.
- **Events:** emit the events in ARCHITECTURE §8 so the backend can index via CSPR.cloud Streaming. Adding a state-changing function means adding its event.
- **Errors:** define explicit error variants (e.g. `Unauthorized`, `BadAllocationSum`, `UnknownAsset`, `SlippageExceeded`). Access/invariant failures abort; a single swap leg failing `min_out` is allowed to skip (partial fill) in `execute_buy`/`rebalance`.
- **Determinism:** all math here is integer and deterministic. There is no LLM and no randomness on-chain.

## Gotchas (Casper / Odra)

- **Rust → WASM, not Solidity.** No EVM idioms; EVM compatibility is on Casper's roadmap but not live. Don't reach for Solidity tooling or patterns.
- **Block time ≈ 8s** (Casper 2.1) and deploys aren't instant — write OdraVM tests for logic; use `-b casper` to validate timing-sensitive behavior.
- **`current_year` comes from block time** — derive it consistently for the glide computation; make horizon math robust when `years_left == 0` (clamp `f` to 0 → end allocation) and when `horizon == 0` (guard divide-by-zero).
- **Hash propagation:** after any deploy, the new contract hashes must be exported to `../backend/.env` and `../frontend/.env`. A behavior change that doesn't update the hashes downstream will look like a silent failure.
- **Mock token mint authority** lives in the `Router` (and `mUSDC.faucet_mint`). Don't grant mint rights anywhere else.

## Definition of done (per change)

- `cargo odra test` and `cargo clippy` pass.
- No golden rule violated (re-check 1–7).
- New/changed state-changing function has the correct caller guard, a `min_out` if it swaps, and an emitted event.
- Allocation invariants (`sum == 10000`, asset membership) still enforced.
- If deployed: hashes exported and propagated to backend + frontend env.