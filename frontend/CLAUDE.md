# CLAUDE.md — Frontend

Guidance for AI coding agents working in `frontend/`. Read this before changing code. Design rationale is in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope of this directory

The Next.js (App Router) UI: wallet, onboarding, portfolio dashboards, activity, and agent chat. It is **display-only for money** and signs **user actions only**. Computed values come from `../backend`; on-chain truth lives in `../contract`.

## 🔴 Golden rules — do not violate

1. **Sign user actions only.** The frontend may build/sign `create_vault`, `deposit`, `withdraw`, `update_config`. It must **never** initiate agent actions (`execute_buy`, `rebalance`, `set_price`) — those are backend-only with the agent key.
2. **No money math in the client.** Don't compute swap amounts, target allocations, drift, or the contribution figure. Fetch them from the backend and render. The only numeric work here is **formatting** fixed-point values for display.
3. **No secrets in the frontend.** Only `NEXT_PUBLIC_*` env values. Never embed a private key, the agent key, or any API secret.
4. **Don't re-derive the target allocation.** It's the contract's glide-adjusted target, relayed by the backend. Render what you receive.
5. **No sensitive data in browser storage.** Don't persist keys or PII in `localStorage`/`sessionStorage`.

If a request conflicts with these, flag it instead of implementing it.

## Layout

```
app/            App Router routes (onboarding, dashboard, portfolio/[vault])
components/     UI (server components for reads; client components for wallet/forms/chat)
lib/api.ts      typed backend client
lib/casper.ts   wallet connect + user-action deploy signing
lib/format.ts   fixed-point -> display strings
hooks/          wallet / portfolio / chat hooks
```

## Commands

```bash
pnpm dev                     # http://localhost:3000
pnpm build
pnpm lint
pnpm typecheck               # if separate from build
```

Run `pnpm lint` and `pnpm typecheck` (or `build`) before considering a change done.

## Conventions

- **Server vs client components:** default to server components for data fetching/rendering; mark client components (`"use client"`) only where wallet, interactivity, or chat require it. Keep the signing/wallet code in client components.
- **Data fetching:** reads go through `lib/api.ts` to the backend. Don't query Casper directly for portfolio values/targets — the backend already merges on-chain state.
- **Money formatting:** values arrive as fixed-point (USD 6 dp; bps for weights). Convert for display in `lib/format.ts`. **Never** do arithmetic that decides anything in `number`.
- **Optimistic UI:** after a signed deploy, account for ~8s block time — show pending state and reconcile against backend reads rather than assuming instant confirmation.
- **Constants:** asset metadata + any contract hashes for display come from env (sourced from `../contract` deploys). Don't hardcode hashes.

## Gotchas (Casper specifics)

- **Casper Wallet signing** is its own UX — handle reject/timeout/no-extension states gracefully.
- **Deploys aren't instant** (~8s finality); don't block the UI waiting synchronously.
- **The buy after a deposit is backend-triggered**, not a frontend action — the UI's responsibility ends at the signed `deposit`; then poll/refresh for the resulting holdings.
- **Hashes change on redeploy** — read them from env, never inline.

## Demo-readiness (don't break)

The dashboard's demo panel (testnet) calls backend endpoints to: set a mock price (push out of band), rebalance now, and mint test `mUSDC`. Keep these wired and visually separate from real user actions, and keep the rebalance **rationale** rendered inline in the activity view.

## Definition of done (per change)

- `pnpm lint` + `pnpm typecheck`/`build` pass.
- No golden rule violated (re-check 1–5).
- No money arithmetic added to the client; no secrets added to env.
- New reads go through `lib/api.ts`; new user actions go through `lib/casper.ts` (and only user actions).