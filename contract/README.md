# Stigma Agent — Contracts

Casper smart contracts for Stigma Agent, written in **Rust** with the **[Odra](https://odra.dev)** framework and compiled to WASM.

> **Project context:** Stigma Agent is an AI-driven, goal-based crypto robo-advisor on Casper testnet (Casper Agentic Buildathon 2026). This directory holds the on-chain layer. See `../frontend` and `../backend` for the other layers.

This is the **source of truth for on-chain state and money movement**. It is also where the **glide-path target allocation is computed** — the backend reads it from a view function rather than recomputing it.

## ⚠️ Everything tradable here is mocked (testnet-only)

The real assets a production version would hold (BTC, tokenized NVIDIA/Google stock, tokenized gold) don't exist on Casper with liquidity, and there's no production price oracle for them. So this directory deploys:

- **CEP-18 mock tokens** — `mUSDC` (base), `mBTC`, `mNVDAx`, `mXAUT`, `mGOOGLx`.
- A **settable mock oracle** — fed real reference prices by the backend keeper; overridable for live demos.
- An **oracle-priced mock router** — swaps without needing real AMM liquidity.

This is the correct design for the problem (mock assets need a mock price source you can move on cue), not a stopgap.

## Contracts

| Contract | Purpose |
| --- | --- |
| `VaultRegistry` | Records per-owner vaults (`register` / `list_vaults`). No factory — each `Vault` is deployed individually (user-signed; see [ADR 0001](../docs/decisions/0001-vault-creation-path.md)). |
| `Vault` | Holds a portfolio's assets; deposit/buy/rebalance/withdraw; computes the current glide target in-contract. |
| `PriceOracle` (mock) | `set_price` / `get_price`; single source of price truth. |
| `Router` (mock) | `swap(token_in, token_out, amount_in, min_out)` priced off the oracle. |
| CEP-18 mock tokens | `mUSDC` (+ `faucet_mint`) and the asset tokens, via `odra-modules`. |

## Layout

```
contract/                   # one Odra crate (cargo-odra's project model)
├── Cargo.toml · Odra.toml  # deps + the list of deployable contracts
├── build.rs · bin/         # Odra build/schema entrypoints
├── rust-toolchain          # pinned nightly that Odra builds with
├── src/
│   ├── constants.rs        # glide-path math + profiles (pure, unit-tested)
│   ├── token.rs            # MockToken (CEP-18 + mint/burn + faucet)
│   ├── oracle.rs           # PriceOracle
│   ├── router.rs           # Router
│   ├── vault.rs            # Vault (deposit/execute_buy/rebalance/withdraw/view_state)
│   ├── registry.rs         # VaultRegistry (owner -> vaults)
│   └── tests.rs            # OdraVM integration tests
├── scripts/deploy.sh
└── README.md · CLAUDE.md · ARCHITECTURE.md
```

## Implementation notes (where the scaffold meets Casper reality)

A few deviations from the spec above, driven by what Casper/Odra actually supports — the security model and glide logic are unchanged:

- **Single Odra crate, not a multi-crate workspace.** `cargo-odra` builds one Odra project; the contracts are organized as modules in `src/` and listed in `Odra.toml`.
- **`VaultFactory` → `VaultRegistry`.** Casper has no on-chain contract-creates-contract primitive (no EVM `CREATE`). Each `Vault` is deployed individually and recorded in the registry; it still has its own `owner` + `agent` and custodies its own funds.
- **Years are `u32`** (Casper's `CLType` has no `U16`).
- **Mock tokens use 6 decimals**, matching the 6-dp prices, so the router's `amount_in * price_in / price_out` stays in 6-dp units.
- **Per-leg partial fills (ARCHITECTURE §7) aren't implemented.** The mock router prices off the same oracle, so a swap never misses its `min_out`; real slippage/partial-fill handling is a production concern.

## Prerequisites

- Rust (the pinned nightly in `rust-toolchain` is selected automatically)
- `rustup target add wasm32-unknown-unknown` (on that toolchain)
- `cargo install cargo-odra`
- `casper-client` (for deploying to testnet)
- A funded Casper **testnet** key (from the [faucet](https://testnet.cspr.live/tools/faucet)) for deploy fees

## Build & test

```bash
cargo odra build            # compile WASM
cargo odra test             # fast unit tests on OdraVM
cargo odra test -b casper    # run against a Casper backend (slower, closer to real)
```

## Deploy (testnet)

```bash
# shared infra order: tokens -> oracle -> router -> registry (NO factory — see ADR 0001)
./scripts/deploy.sh casper-test
```

After deploying, **export the contract hashes** and propagate them to the other layers:

- `../backend/.env` — `VAULT_REGISTRY_HASH`, `ORACLE_HASH`, `ROUTER_HASH`, `TOKEN_*_HASH`
- `../frontend/.env` — any hashes the UI needs for display

`./scripts/deploy.sh` builds the WASM and prints the ordered deploy + wiring +
hash-export plan; submit the deploys with `casper-client` (or an Odra livenet
runner) and a funded key, then record the hashes above.

### Deploy one vault (per user)

Each `Vault` is its own deploy (there is no factory). The livenet runner
`bin/deploy_vault.rs` deploys a `Vault` with its `init` args and then calls the
permissionless `VaultRegistry.register(owner, vault)`. It is both the runbook for
the ADR-0001 user-signed deploy (identical init args/order) and the way to deploy
a test vault manually:

```bash
set -a && . ./.env && set +a          # loads ODRA_CASPER_LIVENET_* (node, chain, key)
cargo run --bin deploy_vault --features livenet
# add VAULT_SMOKE=1 to also faucet -> approve -> deposit -> execute_buy and
# prove the on-chain wiring executes a swap without reverting.
```

The infra hashes (oracle, router, registry, 5 tokens) are read from
`deployed.casper-test.json` automatically; only the livenet credentials come from
`.env`.

Override the defaults via env: `VAULT_OWNER`, `VAULT_AGENT`, `VAULT_PROFILE`,
`VAULT_BASE_ALLOCATION` (5 bps, Σ=10000), `VAULT_TARGET_AMOUNT_USD`,
`VAULT_TARGET_YEAR`, and the `*_GAS` knobs (see the file header).

## Key numbers (must match the other layers)

- **Allocations** in basis points, Σ = `10000`.
- **USD** as fixed-point integers, 6 decimals.
- **Profiles:** `Conservative` / `Moderate` / `Aggressive`.
- **Glide curves** (start/end allocation per profile) live here — see `ARCHITECTURE.md`. The backend reads the *computed* target via the vault view, so it does not duplicate these.

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — full interface spec, access-control table, on-chain data model, glide computation, execution logic.
- **[CLAUDE.md](./CLAUDE.md)** — invariants and conventions for AI coding agents.