# Stigma Agent — Frontend

The **Next.js** (latest, App Router) frontend for Stigma Agent.

> **Project context:** Stigma Agent is an AI-driven, goal-based crypto robo-advisor on Casper testnet (Casper Agentic Buildathon 2026). This directory is the user interface. See `../backend` (API + agent) and `../contract` (on-chain).

## Responsibilities

- **Wallet** — connect Casper Wallet and **sign user actions** (create vault, deposit, withdraw, edit config).
- **Onboarding** — the risk questionnaire + demographics, then show the AI-assigned profile.
- **Portfolios** — starter and custom portfolios: target vs current allocation, value, **progress-to-goal**, suggested monthly contribution.
- **Activity** — rebalance history with the **agent's rationale** surfaced (not buried).
- **Agent chat** — natural-language Q&A about a portfolio.

> **Display-only for money.** The frontend never decides amounts. It reads computed values (portfolio value, the contract's target allocation, the required contribution) from the backend / chain and renders them. All money-moving math lives in `../contract` and `../backend`.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind · `casper-js-sdk` (+ CSPR.click for wallet connection) · a data-fetching layer (React Query or SWR) · a charting lib for allocation/goal visuals.

## Structure

```
frontend/
├── app/                    # App Router routes
│   ├── (onboarding)/       #   questionnaire flow
│   ├── dashboard/          #   portfolios overview
│   ├── portfolio/[vault]/  #   single portfolio (allocation, goal, activity, chat)
│   └── layout.tsx
├── components/             # UI components (server where possible, client for interactivity)
├── lib/
│   ├── api.ts              # typed client for the backend REST API
│   ├── casper.ts           # wallet + deploy signing (casper-js-sdk / CSPR.click)
│   └── format.ts           # fixed-point -> display formatting
├── hooks/                  # wallet, portfolio, chat hooks
├── README.md
├── CLAUDE.md
└── ARCHITECTURE.md
```

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev                    # http://localhost:3000
```

### Environment

Only public (`NEXT_PUBLIC_*`) values — **no secrets in the frontend**.

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_CASPER_NETWORK=casper-test
NEXT_PUBLIC_CASPER_NODE_URL=https://node.testnet.casper.network/rpc
# Contract hashes the UI passes to `Vault::init` when the USER signs the
# create-vault deploy (ADR 0001). Public testnet hashes from
# ../contract/deployed.casper-test.json. NO registry hash — the backend calls
# VaultRegistry.register; all reads go through the backend.
NEXT_PUBLIC_AGENT_PUBLIC_KEY=...        # the agent PUBLIC key (not a secret)
NEXT_PUBLIC_ORACLE_HASH=hash-...
NEXT_PUBLIC_ROUTER_HASH=hash-...
NEXT_PUBLIC_TOKEN_MUSDC_HASH=hash-...   # + MBTC, MNVDAX, MXAUT, MGOOGLX (see .env.example)
```

See [`.env.example`](.env.example) for the complete list with prefilled values.

## How it connects

- **To the backend:** typed REST calls via `lib/api.ts` (onboarding, portfolios, projection, chat, demo endpoints).
- **To Casper:** user-signed deploys via `lib/casper.ts` (create/deposit/withdraw/edit). The frontend **never** triggers agent actions (`execute_buy` / `rebalance` / `set_price`) — those are backend-only.

## Docs

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — route map, data flow, the signing boundary, component structure.
- **[CLAUDE.md](./CLAUDE.md)** — invariants and conventions for AI coding agents.