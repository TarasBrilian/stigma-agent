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
# deploy order: tokens -> oracle -> router -> vault factory
./scripts/deploy.sh casper-test
```

After deploying, **export the contract hashes** and propagate them to the other layers:

- `../backend/.env` — `VAULT_REGISTRY_HASH`, `ORACLE_HASH`, `ROUTER_HASH`, `TOKEN_*_HASH`
- `../frontend/.env` — any hashes the UI needs for display

`./scripts/deploy.sh` builds the WASM and prints the ordered deploy + wiring +
hash-export plan.

To deploy directly, use the bundled **Odra livenet runner**. Create `contract/.env`
with a funded testnet key:

```
ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network/rpc
ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
ODRA_CASPER_LIVENET_SECRET_KEY_PATH=casper_account.pem
ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.casper.network/events
```

then, from `contract/`:

```bash
cargo odra build
cargo run --bin livenet_deploy --features livenet -- preflight   # print deployer (no gas)
cargo run --bin livenet_deploy --features livenet                # deploy all + wire
```

It deploys the 5 tokens + oracle + router + registry, wires `set_minter`/`set_price`,
and prints every contract hash to paste into the env files above. (~250 CSPR per
install on testnet.)

## Deployed addresses (casper-test)

Live on the Casper **testnet** (`casper-test`, node `https://node.testnet.casper.network/rpc`).
Deployer account `account-hash-b9f3740ef94e78a56f86fa795a6fd136f432164e3c1915284bc2636b7cf933b8`.
Each token is wired with the Router as mint/burn authority and seeded with a 6-dp
reference price. (Also recorded in the gitignored `deployed.casper-test.json`.)

| Contract | Hash | Explorer |
| --- | --- | --- |
| `PriceOracle` | `hash-b7a88105f1895aade1eddff75da751ddb31e7c53ddd5876fb1946b48337a6369` | [↗](https://testnet.cspr.live/contract-package/b7a88105f1895aade1eddff75da751ddb31e7c53ddd5876fb1946b48337a6369) |
| `Router` | `hash-8a415764e5062ad3f228b013f986dd529cb1f311858f2b84756c1946432e5cf3` | [↗](https://testnet.cspr.live/contract-package/8a415764e5062ad3f228b013f986dd529cb1f311858f2b84756c1946432e5cf3) |
| `VaultRegistry` | `hash-70bcab28a355285261a86a718fa9e4a52b3986797b0d8de8eadbcb3d672f112e` | [↗](https://testnet.cspr.live/contract-package/70bcab28a355285261a86a718fa9e4a52b3986797b0d8de8eadbcb3d672f112e) |
| `mUSDC` (faucet) | `hash-4847bc198c6641daf3c8ac40211a8180800d630fb756ab7911ffc0eb81310a9b` | [↗](https://testnet.cspr.live/contract-package/4847bc198c6641daf3c8ac40211a8180800d630fb756ab7911ffc0eb81310a9b) |
| `mBTC` | `hash-f8f4931076a8766061319e9c277151b8aa5f9c96c50bf5304443a4cc8ff52370` | [↗](https://testnet.cspr.live/contract-package/f8f4931076a8766061319e9c277151b8aa5f9c96c50bf5304443a4cc8ff52370) |
| `mNVDAx` | `hash-9a3d90b3ce61ae24533ba84b6a800faeb7199787f2cf77f476cb870b0aaadf1a` | [↗](https://testnet.cspr.live/contract-package/9a3d90b3ce61ae24533ba84b6a800faeb7199787f2cf77f476cb870b0aaadf1a) |
| `mXAUT` | `hash-52596790c10528740a44d028eab13360ea12cc4ff953521e0a7802fdfab2accf` | [↗](https://testnet.cspr.live/contract-package/52596790c10528740a44d028eab13360ea12cc4ff953521e0a7802fdfab2accf) |
| `mGOOGLx` | `hash-84e72cd3ba99d5dab36fc1dd80e64a5c1e581e1a5296b4378fe1a6d1948779a5` | [↗](https://testnet.cspr.live/contract-package/84e72cd3ba99d5dab36fc1dd80e64a5c1e581e1a5296b4378fe1a6d1948779a5) |

Canonical asset order is `[mUSDC, mBTC, mNVDAx, mXAUT, mGOOGLx]`. For the backend/frontend `.env`:

```
CASPER_NODE_URL=https://node.testnet.casper.network/rpc
CASPER_NETWORK_NAME=casper-test
ORACLE_HASH=hash-b7a88105f1895aade1eddff75da751ddb31e7c53ddd5876fb1946b48337a6369
ROUTER_HASH=hash-8a415764e5062ad3f228b013f986dd529cb1f311858f2b84756c1946432e5cf3
VAULT_REGISTRY_HASH=hash-70bcab28a355285261a86a718fa9e4a52b3986797b0d8de8eadbcb3d672f112e
TOKEN_MUSDC_HASH=hash-4847bc198c6641daf3c8ac40211a8180800d630fb756ab7911ffc0eb81310a9b
TOKEN_MBTC_HASH=hash-f8f4931076a8766061319e9c277151b8aa5f9c96c50bf5304443a4cc8ff52370
TOKEN_MNVDAX_HASH=hash-9a3d90b3ce61ae24533ba84b6a800faeb7199787f2cf77f476cb870b0aaadf1a
TOKEN_MXAUT_HASH=hash-52596790c10528740a44d028eab13360ea12cc4ff953521e0a7802fdfab2accf
TOKEN_MGOOGLX_HASH=hash-84e72cd3ba99d5dab36fc1dd80e64a5c1e581e1a5296b4378fe1a6d1948779a5
```

## Key numbers (must match the other layers)

- **Allocations** in basis points, Σ = `10000`.
- **USD** as fixed-point integers, 6 decimals.
- **Profiles:** `Conservative` / `Moderate` / `Aggressive`.
- **Glide curves** (start/end allocation per profile) live here — see `ARCHITECTURE.md`. The backend reads the *computed* target via the vault view, so it does not duplicate these.

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — full interface spec, access-control table, on-chain data model, glide computation, execution logic.
- **[CLAUDE.md](./CLAUDE.md)** — invariants and conventions for AI coding agents.