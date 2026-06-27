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
| `VaultFactory` | Creates per-portfolio vaults; sets `owner` (user) and `agent`. |
| `Vault` | Holds a portfolio's assets; deposit/buy/rebalance/withdraw; computes the current glide target in-contract. |
| `PriceOracle` (mock) | `set_price` / `get_price`; single source of price truth. |
| `Router` (mock) | `swap(token_in, token_out, amount_in, min_out)` priced off the oracle. |
| CEP-18 mock tokens | `mUSDC` (+ `faucet_mint`) and the asset tokens, via `odra-modules`. |

## Layout

```
contract/
├── Cargo.toml              # cargo workspace
├── vault/                  # VaultFactory + Vault
├── mock-token/             # CEP-18 tokens
├── mock-oracle/            # PriceOracle
├── mock-router/            # Router
├── scripts/                # deploy + hash-export scripts
├── README.md
├── CLAUDE.md
└── ARCHITECTURE.md
```

## Prerequisites

- Rust (stable)
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
# deploy order: tokens -> oracle -> router -> vault factory
./scripts/deploy.sh casper-test
```

After deploying, **export the contract hashes** and propagate them to the other layers:

- `../backend/.env` — `VAULT_FACTORY_HASH`, `ORACLE_HASH`, `ROUTER_HASH`, `TOKEN_*_HASH`
- `../frontend/.env` — any hashes the UI needs for display

The deploy script writes a `deployed.<network>.json` you can copy from.

## Key numbers (must match the other layers)

- **Allocations** in basis points, Σ = `10000`.
- **USD** as fixed-point integers, 6 decimals.
- **Profiles:** `Conservative` / `Moderate` / `Aggressive`.
- **Glide curves** (start/end allocation per profile) live here — see `ARCHITECTURE.md`. The backend reads the *computed* target via the vault view, so it does not duplicate these.

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — full interface spec, access-control table, on-chain data model, glide computation, execution logic.
- **[CLAUDE.md](./CLAUDE.md)** — invariants and conventions for AI coding agents.