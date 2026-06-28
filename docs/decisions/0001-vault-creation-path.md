# ADR 0001 — Vault creation path (who signs the `Vault.wasm` deploy)

- **Status:** Accepted (2026-06-28)
- **Scope:** cross-layer (contract · backend · frontend)
- **Supersedes:** the stale `VaultFactory.create_vault` model in
  `contract/ARCHITECTURE.md` §1/§2/§4 (no factory exists — see
  [`contract/src/registry.rs`](../../contract/src/registry.rs) feasibility note).

## Context

Creating a vault means getting a `Vault` contract instance live on testnet,
configured with the user as `owner`, then recording it so the user's vaults are
listable.

Two Casper/Odra facts shape the decision:

1. **No contract-deploys-contract primitive.** Unlike EVM `CREATE`, a contract
   cannot deploy another contract on Casper. So there is no on-chain
   `VaultFactory.create_vault`; "create vault" is a standalone deploy of the
   `Vault.wasm` **module bytes**, signed by some key.
   (`contract/src/registry.rs:3-7`)
2. **`Vault::init` takes `owner` as an explicit argument**
   (`contract/src/vault.rs:107-118`), so the **deployer can differ from the
   owner**. Whoever signs the deploy, `owner` is whatever address we pass in.
3. **`VaultRegistry.register(owner, vault)` is permissionless and idempotent**
   and moves **no funds** (`contract/src/registry.rs:28`). So registration is a
   separate concern from who signs the vault deploy — anyone can call it safely.

## Decision

**The user signs the `Vault.wasm` module-bytes deploy (becoming both deployer and
`owner` from genesis). The backend then calls the permissionless `register`
after observing the deploy, and records the off-chain `PortfolioMeta` mirror.**

```
FRONTEND  buildCreateVaultDeploy(userPubKey, args)
            ship Vault.wasm as module bytes
            init args(owner = USER, agent = AGENT_PUBLIC_KEY, profile,
                      base_allocation, target_amount_usd, target_year,
                      oracle, router, assets[5])
            user signs in Casper Wallet ──► deploy lands on testnet
            read the new vault address from the deploy result
                  │
                  ▼  POST /portfolios { owner, vault, ... }   // frontend reports the address
BACKEND   chain.register(owner, vault)     // permissionless, no funds, idempotent
          save PortfolioMeta               // off-chain mirror
```

> **There is no chain event to "observe" a vault deploy.** `Vault::init` emits
> nothing and `VaultRegistered` is only emitted *by* `register`. So the backend
> cannot discover a freshly deployed vault on its own — the **frontend reports
> the new vault address** (it has it from the deploy result) via `POST
> /portfolios`, and the backend registers + mirrors it in one handler.

### Why this path

- **Trustless / non-custodial from genesis.** The user is the deployer and
  `owner`; no backend key ever sits on the custody path. This is the core
  product story (the agent can `execute_buy`/`rebalance` but **never**
  `withdraw`).
- **Matches the existing architecture and code comments** — no doc churn beyond
  correcting the dead `VaultFactory` references:
  `backend/ARCHITECTURE.md:137`, `backend/src/onboarding/onboarding.service.ts:17`,
  `backend/src/portfolio/portfolio.service.ts:64`,
  `backend/src/portfolio/portfolio.controller.ts:25`, `frontend/README.md:64`.
- **`register` stays off the user.** It is permissionless and fund-free, so the
  backend doing it costs no trust and saves the user a second signature. This
  respects backend golden rule #4 / contract golden rule #1 (deploying and
  registering a vault is fine; the **agent key** never touches a fund-moving
  path — and here register isn't even signed by the agent key, it's a plain
  permissionless call).

### Known risk (accepted)

Casper Wallet module-bytes (session WASM) deploys ship the full `Vault.wasm`
payload and cost more gas than a stored-contract call, and the wallet UX for
large deploys is rougher than a simple entry-point call. We accept this to keep
the custody model trustless. If the demo proves the module-bytes deploy
unreliable in the wallet, the fallback is **backend-deployed** (a
`chain.deployVault` with a dedicated *deployer* key — never the agent key —
setting `owner = user`); revisit this ADR rather than silently switching.

## Consequences / downstream tasks

- **Contract** (`contract/docs/TASK.md`): the per-vault deploy runner is the
  reference/runbook for the **user-signed** deploy (same init args, same order),
  and is also what an operator uses to deploy manually for testing. `register`
  is exercised by the backend, not the deploy runner.
- **Frontend** (`frontend/docs/TASK.md`): `buildCreateVaultDeploy` builds a
  module-bytes deploy of `Vault.wasm` with the init args above (owner = the
  connected user). After confirmation, read the new vault address from the deploy
  result and call `POST /portfolios` with it. The on-chain
  `VaultRegistry.register` is **not** signed by the user.
- **Backend** (`backend/docs/TASK.md`): add `chain.register(owner, vault)`
  (permissionless call, no agent key required) invoked from the `POST /portfolios`
  handler using the vault address the frontend reports; keep the off-chain
  `PortfolioMeta` mirror in the same handler. No `chain.deployVault` is needed for
  the accepted path (it is the fallback only).
- **Env propagation (NEW need created by this decision)** — because the *user*
  signs the deploy, the **frontend** needs everything `Vault::init` consumes, not
  just `mUSDC`: the `Vault.wasm` bytes, `AGENT_PUBLIC_KEY`, the `oracle` hash, the
  `router` hash, and all **5 asset token hashes** (`assets[5]`: mUSDC + the four
  assets). It also needs `TOKEN_MUSDC_HASH` for the deposit `approve`. It does
  **not** need the `VaultRegistry` hash (the backend, not the UI, calls
  `register`; reads go through the backend). This expands the contract export task
  and the frontend env task, which previously assumed "frontend needs at least
  `TOKEN_MUSDC_HASH`".
- **Docs reconciled (done):** the dead `VaultFactory.create_vault` framing has been
  dropped in favour of "user-signed `Vault` deploy + `VaultRegistry.register`"
  across `contract/ARCHITECTURE.md` (§1 mermaid, §2 access-control table, §4
  interface, §9.4), `contract/README.md`, `contract/CLAUDE.md` (scope + layout +
  deploy order), `backend/ARCHITECTURE.md` §6, and the `registry.rs` module note.
