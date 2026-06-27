# CLAUDE.md — Backend

Guidance for AI coding agents working in `backend/`. Read this before changing code. Design rationale is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope of this directory

The NestJS backend: REST API + the AI agent (OpenRouter) + the keeper (price feed & rebalance scheduler) + x402 billing. It holds the **agent hot key** and owns the **deterministic finance decisions** (rebalance band, projection). It does **not** own the glide-path math — that is computed on-chain and read via the vault's `view_state`.

## 🔴 Golden rules — do not violate

1. **The LLM never produces executed numbers.** The `agent` module may classify a profile, suggest a (user-editable) allocation, decide *whether* to rebalance, and write rationale/answers. Drift detection, swap amounts, and the contribution projection are deterministic functions. Never pipe an LLM output directly into a swap amount or a stored allocation.
2. **`chain` is the only module that talks to Casper.** Route all deploys/reads through it. No other module imports `casper-js-sdk`.
3. **`agent` is the only module that calls OpenRouter.** Keep money logic out of it; keep chain logic out of it.
4. **Never attempt a withdraw with the agent key.** The agent can only `execute_buy` / `rebalance` (enforced on-chain). Don't write code that tries to construct a withdraw or any fund-moving deploy with the agent key.
5. **Don't re-implement the glide target.** Read it from `chain.view_state(vault)`. The backend owns only the rebalance *band* and the projection *return assumptions*.
6. **Keeper guards stay.** Keep the min-trade check, max-once-per-day-per-vault, and the idempotency lock. Removing any reintroduces thrashing or double-execution.
7. **x402 only on rebalance.** Don't gate other endpoints with x402.
8. **Never log or return the agent key**, and keep `secrets/` + `.env` out of VCS.

If a request conflicts with these, flag it instead of implementing it.

## Module responsibilities

```
onboarding  questionnaire + demographics -> agent.profile()
portfolio   vault metadata mirror; starter generation
agent       OpenRouter only (profiling, suggestions, rationale, Q&A)
chain       casper-js-sdk only (deploys, reads, agent key)
keeper      cron: price feed + rebalance scan/trigger; holds the lock
pricing     external prices + projection math
billing     x402 gating for rebalance
```

## Commands

```bash
pnpm start:dev               # watch mode (http://localhost:3001)
pnpm build
pnpm lint
pnpm test                    # unit
pnpm test:e2e                # if present
pnpm prisma migrate dev      # apply migrations
pnpm prisma studio           # inspect the DB
```

Run `pnpm lint` and `pnpm test` before considering a change done.

## Conventions

- **NestJS structure:** one module per concern (above); controllers thin, logic in services; DTOs validated with `class-validator`. Cron jobs via `@nestjs/schedule`.
- **Money/units:** USD as fixed-point 6-dp; weights as bps (Σ = 10000). Use `bigint` or a decimal library for value math — **never** plain `number`. Match the contract's conventions exactly.
- **Constants that must match the contract:** asset list + token hashes, profile enum, fixed-point conventions come from `../contract`. The drift bands (300/500/800 bps) and return assumptions (6/12/20%) are **owned here** — keep them in one config file, not scattered.
- **Reads vs writes:** read on-chain state live (via `chain`); treat the DB as PII/text/history/display only, never as the source of truth for balances or the target allocation.
- **Errors:** surface chain errors (don't swallow). A single failed swap leg is expected (partial fill) and logged; a failed guard aborts the trigger.
- **Demo endpoints are first-class** (see below) — keep them working.

## Gotchas (Casper specifics)

- **Casper uses deploys**, not EVM txs; reads/events via CSPR.cloud (REST/Streaming/Node). Don't assume EVM RPC semantics.
- **Block time ≈ 8s** and finality isn't instant — account for it in deposit→buy event handling and in tests that hit a live node.
- **Deposit→buy is event-driven:** observe the `Deposited` event and then `executeBuy` with the agent key. Key the handler by deposit/event id for idempotency.
- **Contract hashes** come from `../contract` deploys into this `.env`. If a contract is redeployed, update the hashes or calls will silently target the wrong contract.
- **Glide target is on-chain** — if a portfolio's target "looks wrong," check the contract's `view_state`, not a local re-derivation (there shouldn't be one).

## Demo-readiness (don't break)

- `POST /keeper/oracle/override` — manual price set (logged `source = manual-override`).
- `POST /keeper/rebalance/:vault` — trigger a rebalance without waiting for the loop.
- `POST /faucet/musdc` — mint test mUSDC.
- Rebalance **rationale** persisted to `RebalanceLog` and returned to the UI.

## Definition of done (per change)

- `pnpm lint` + `pnpm test` pass; migrations created if the schema changed.
- No golden rule violated (re-check 1–8).
- Bands/return assumptions live in the single config file, not duplicated.
- Chain access only via `chain`; OpenRouter only via `agent`.
- Demo endpoints still work.