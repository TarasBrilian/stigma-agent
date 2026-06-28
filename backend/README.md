# Stigma Agent — Backend

The **NestJS** backend for Stigma Agent. It serves the REST API **and** runs the AI agent and the keeper.

> **Project context:** Stigma Agent is an AI-driven, goal-based crypto robo-advisor on Casper testnet (Casper Agentic Buildathon 2026). This directory is the brain + orchestration layer. See `../frontend` (UI) and `../contract` (on-chain).

## Responsibilities

- **REST API** for the frontend (onboarding, portfolios, deposits/withdraws metadata, chat).
- **Agent** — all LLM work via **OpenRouter**: risk profiling, portfolio/allocation suggestions, rebalance rationale, Q&A.
- **Chain access** — the only place that talks to Casper (`casper-js-sdk`): builds/sends deploys, reads vault/oracle state, holds the **agent hot key**.
- **Keeper** — scheduled jobs: feed the mock oracle real prices, and scan vaults to decide + trigger rebalances.
- **Billing** — x402 micro-fee on rebalance.
- **Deterministic finance math** — drift decision and contribution projection (the LLM never produces these numbers).

> The current target allocation is **read from the contract's view** (`view_state`) — the backend does not re-implement the glide-path math. It only owns the **rebalance decision** (bands) and **projection** (return assumptions).

## Stack

NestJS · TypeScript · PostgreSQL (Prisma) · `@nestjs/schedule` · `casper-js-sdk` · CSPR.cloud (reads/events) · OpenRouter · x402 facilitator.

## Modules

```
onboarding   questionnaire + demographics -> calls agent for profiling
portfolio    off-chain mirror of vault metadata; starter-portfolio generation
agent        OpenRouter orchestration (profiling, suggestions, rationale, Q&A)
chain        casper-js-sdk wrapper; deploys, reads, agent key (ONLY chain access)
keeper       cron: price feed -> oracle; rebalance scanner/trigger; holds the lock
pricing      external price fetch; contribution projection
billing      x402 gating for rebalance
```

## Setup

```bash
pnpm install
cp .env.example .env        # fill in (see below)
pnpm prisma migrate dev     # set up the database
pnpm start:dev              # http://localhost:3001
```

### Environment

```dotenv
# database
DATABASE_URL=postgresql://user:pass@localhost:5432/stigma

# LLM
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...                  # you pick the model

# Casper
CASPER_NODE_URL=...                   # testnet RPC / CSPR.cloud endpoint
CASPER_NETWORK_NAME=casper-test
CSPR_CLOUD_API_KEY=...
AGENT_SECRET_KEY_PATH=./secrets/agent_secret_key.pem   # the single agent hot key

# contract hashes (from ../contract/deployed.casper-test.json)
VAULT_REGISTRY_HASH=hash-...           # registry, not a factory (Casper has no on-chain CREATE)
ORACLE_HASH=hash-...
ROUTER_HASH=hash-...
TOKEN_MUSDC_HASH=hash-...
TOKEN_MBTC_HASH=hash-...
TOKEN_MNVDAX_HASH=hash-...
TOKEN_MXAUT_HASH=hash-...
TOKEN_MGOOGLX_HASH=hash-...

# prices & billing
PRICE_API_KEY=...                     # CoinGecko / stock source
X402_FACILITATOR_URL=...

# keeper cadence
KEEPER_INTERVAL_MS=300000             # price feed
REBALANCE_INTERVAL_MS=3600000         # rebalance check
```

> Keep `secrets/` out of version control. Never log the agent key.

## REST surface (indicative)

| Method & path | Purpose |
| --- | --- |
| `POST /onboarding/answers` | submit questionnaire + demographics → profile |
| `GET /portfolios?owner=` | list a user's portfolios (mirror + on-chain state) |
| `POST /portfolios/starter` | generate starter portfolios for a profile |
| `POST /portfolios/suggest` | AI-suggested allocation for a custom goal |
| `GET /portfolios/:vault/projection` | live required monthly contribution + on-track |
| `POST /agent/chat` | natural-language Q&A about a portfolio |
| `POST /keeper/oracle/override` | **demo:** manually set a mock price |
| `POST /keeper/rebalance/:vault` | **demo:** trigger a rebalance now |
| `POST /faucet/musdc` | **demo:** mint test mUSDC |

User-signed actions (create vault, deposit, withdraw, edit) happen in the **frontend**; the backend records metadata and reads resulting on-chain state.

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — module design, agent boundary, keeper loops, algorithms (decision + projection), data model, flows, security.
- **[CLAUDE.md](./CLAUDE.md)** — invariants and conventions for AI coding agents.