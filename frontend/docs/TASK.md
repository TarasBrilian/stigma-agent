# Frontend — TASK.md

Execution backlog for AI coding agents working in `frontend/`. Read
[`../CLAUDE.md`](../CLAUDE.md) (golden rules) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
(design) **before** starting — every task cites the rule it must not break.

The UI is **display-only for money** and signs **user actions only**. The read
side (routes, components, React Query, wallet session) is built; the **write side
is stubbed** — every deploy builder throws and none is wired into a screen, so a
user currently cannot create a vault, deposit, or withdraw from the UI.

## How to read this file

- **Priority:** `P0` = blocks the end-to-end demo (deposit → buy → rebalance);
  `P1` = needed for a robust demo; `P2` = hardening / polish.
- Tasks are ordered by the **critical path to a working demo**.
- `ref:` = file/line to change. `done:` = acceptance criterion. `🔴` = golden rule.

## Cross-layer critical path (where the frontend sits)

```
FRONTEND: connect wallet ─► onboarding ─► create vault (sign) ─► deposit (sign)
                                              │                      │
                                              ▼                      ▼
                                     POST /portfolios        backend observes Deposited ─► executeBuy
FRONTEND: portfolio page ◄── live state relayed by backend (viewState/getPrices) ◄───────────────┘
```
Reads depend on the backend's `chain` wiring; writes depend on `lib/casper.ts`
below. The two are independent — frontend write work can proceed in parallel.

---

## 1. Critical path — make the demo work (P0)

### P0 · Implement the user-action deploy builders (`lib/casper.ts`)
All four builders throw today and the architectural seam matters: there is **no
`VaultFactory`** — the contract uses a `VaultRegistry`, so "create vault" means
the user signs a `Vault` WASM module-bytes deploy with init args; the **backend**
then calls `registry.register` (the UI does not — see ADR 0001).
- [x] **Decide the vault-creation path with the backend**: user-signed module deploy
      (ship `Vault.wasm`, build a module-bytes deploy) vs backend-deployed + user owns it.
      DECIDED: **user-signed module-bytes deploy** of `Vault.wasm` (user = deployer +
      `owner`); the backend calls the permissionless `register` afterward — the user
      does NOT sign register. See
      [`../../docs/decisions/0001-vault-creation-path.md`](../../docs/decisions/0001-vault-creation-path.md).
      Next: `buildCreateVaultDeploy` builds the module-bytes deploy with init args
      (owner = connected user, agent = `env.agentPublicKey`, profile, base_allocation,
      target_amount_usd, target_year, oracle = `env.oracleHash`, router = `env.routerHash`,
      assets = the 5 `env.tokenHashes`). The stale `VaultFactory.create_vault` comment at
      `lib/casper.ts:83` was already replaced with the ADR-0001 plan (P0-2).
      ref: `lib/casper.ts:79` (`buildCreateVaultDeploy` — body still throws; env accessors ready)
      done: a documented decision; the builder matches it
- [ ] Implement `buildDepositDeploy` (the demo entry point — fund an existing vault).
      ref: `lib/casper.ts:89`  🔴 golden rule #1 (build USER actions only)
      done: returns a valid unsigned `Deploy` calling `Vault.deposit(amount)` with CLValue args
- [x] Fix the env to match ADR 0001. Under user-signed creation the UI does **not** need a
      registry hash (the backend calls `register`; reads go via backend) — so **remove**
      `NEXT_PUBLIC_VAULT_FACTORY_HASH` rather than renaming it. Add what `Vault::init` needs:
      `NEXT_PUBLIC_AGENT_PUBLIC_KEY`, `…_ORACLE_HASH`, `…_ROUTER_HASH`, and the **5 asset token
      hashes** (`…_TOKEN_MUSDC_HASH` + the four assets); `TOKEN_MUSDC_HASH` also covers the
      deposit `approve`.
      DONE: `lib/constants.ts` `env` now exposes `agentPublicKey`, `oracleHash`, `routerHash`,
      and `tokenHashes` (5, canonical order) as static `NEXT_PUBLIC_*` reads; `vaultFactoryHash`
      removed. `.env.example` carries the full set (oracle/router/5 tokens prefilled from
      `deployed.casper-test.json`; agent key left as a placeholder). `tsc --noEmit` + `eslint` clean.
      ref: `lib/constants.ts:35` (`env`), `.env.example`, `lib/casper.ts:83` (builder comment updated);
      `../../docs/decisions/0001-vault-creation-path.md`
      STILL TODO (belongs to the builder task, not env): how the UI obtains the `Vault.wasm`
      bytes (static asset/public path) for the module-bytes deploy.

### P0 · Sign & submit plumbing (`lib/casper.ts`)
- [x] Serialize the transaction to the JSON shape Casper Wallet expects and attach the
      returned signature as an `Approval`.
      DONE: MIGRATED off legacy `Deploy` — the builders emit a Casper 2.0 `Transaction`
      (TransactionV1), so `signDeployWithWallet`→`signTransactionWithWallet(tx, publicKeyHex)`
      now signs the SDK's canonical `Transaction.toJSON()` via `provider.sign`, then attaches
      the signature with `tx.setSignature(sig, PublicKey.fromHex(pk))`. The wallet returns a
      raw 64-byte signature; `toApprovalSignature` prepends the 1-byte algorithm tag
      (`0x01` ed25519 / `0x02` secp256k1, == the signer pubkey's own prefix byte) that a
      Casper approval requires — a wallet that already tagged it (65 bytes) passes through.
      Cancelled/empty/malformed signatures throw. Mirrors the backend's proven `tx.sign(key)`
      path, differing only in that the signer is the wallet. `tsc --noEmit` clean.
      ref: `lib/casper.ts` (`signTransactionWithWallet`/`toApprovalSignature`; hex decode reuses the SDK's `Conversions.decodeBase16` — no hand-rolled decoder)
      🔴 golden rule #1 (only USER-action transactions are signed here)
- [x] Verify submit puts the signed transaction via `RpcClient` and returns the hash.
      DONE: `submitDeploy`→`submitTransaction(tx)` uses `RpcClient.putTransaction(tx)` (not the
      legacy `putDeploy`) and returns `result.transactionHash.toHex()`.
      ref: `lib/casper.ts` (`submitTransaction`)
      ⚠️ STILL TODO (live E2E): a wallet-signed deposit landing on testnet needs the deposit
      FORM (next task) + the real Casper Wallet extension to confirm it accepts the
      `Transaction.toJSON()` payload — the one thing untestable without the live wallet, like
      the backend live-validated its own writes.
      done: a wallet-signed deposit lands on testnet and the tx hash is shown

### P0 · Wire the create-vault flow into the UI (no flow exists today)
`QuestionnaireForm` ends at displaying the profile + a starter count; there is no
path from there to actually creating a vault.
- [ ] After the profile result, let the user pick/edit a starter allocation, then run the
      agreed creation path (ADR 0001): user signs the `Vault.wasm` deploy, the UI reads the
      new vault address from the deploy result, then calls `api.register` (`POST /portfolios`)
      with `{ owner, vault, ... }`. The **backend** performs the on-chain `VaultRegistry.register`
      AND the off-chain mirror in that handler — the UI does **not** sign an on-chain register.
      ref: `components/QuestionnaireForm.tsx:49-60` (result view dead-ends); `lib/api.ts` (no `register` method yet — add it); `../../docs/decisions/0001-vault-creation-path.md`
      🔴 golden rule #1 (user actions only — the on-chain register is backend's, not the UI's) · #2 (allocation edited as bps, validated on-chain; UI only formats)
      done: onboarding → user-signed vault deploy → address reported to backend → registered on-chain + mirrored in Postgres → it appears on `/dashboard`

### P0 · Deposit flow — approve + deposit (two signed deploys; none exists today)
`Vault.deposit` calls `transfer_from(owner → vault)`, so the owner must FIRST
**approve** the vault as a `mUSDC` spender (see the contract test: `approve` then
`deposit`). The portfolio page has no deposit UI and there is no approve builder.
- [ ] Add `buildApproveDeploy(mUSDC, vault, amount)` (CEP-18 `approve`) — missing from `lib/casper.ts`.
      ref: `lib/casper.ts:89` (next to `buildDepositDeploy`); `../../contract/src/vault.rs:136` (`deposit` → `transfer_from`); `../../contract/src/tests.rs:126` (approve-then-deposit)
      needs: the `mUSDC` token hash in env (see the env task)  🔴 golden rule #1 (user action)
- [ ] Add a deposit form that signs **approve then deposit** (or checks allowance first),
      shows pending, and reconciles via backend reads (~8s block time).
      ref: `app/portfolio/[vault]/page.tsx:91` (only `DemoPanel` today)
      🔴 golden rule #1 (user actions only) · #2 (format only, no value math)
      done: a user funds a vault from the portfolio page; holdings refresh after confirmation

---

## 2. Hardening & polish (P1 / P2)

### P1 · Withdraw & update-config builders + UI
- [ ] Implement `buildWithdrawDeploy` and `buildUpdateConfigDeploy`, add their forms.
      ref: `lib/casper.ts:98,107`  🔴 golden rule #1 (still user actions — never `execute_buy`/`rebalance`/`set_price`)
      note: `withdraw(amount)` liquidates ALL holdings to `mUSDC` then sends `amount`; surface that a
      partial withdraw moves the remainder to cash until the agent re-buys (set user expectation)

### P1 · Optimistic UI + reconcile
- [ ] After any signed deploy, show pending and reconcile against backend reads rather than
      assuming instant confirmation (~8s finality).
      ref: `../ARCHITECTURE.md` §4; `hooks/use-portfolios.ts` (invalidate queries on success)

### P2 · Versioned questionnaire from the backend
- [ ] Replace the hardcoded `QUESTIONS` with the versioned questionnaire fetched from the API.
      ref: `components/QuestionnaireForm.tsx:17` (TODO)

### P2 · Wallet UX edge states
- [ ] Handle reject / timeout / no-extension / locked / active-key-change gracefully end to end.
      ref: `lib/casper.ts:26-33`, `hooks/use-wallet.ts:49-53`

### P2 · Minor cleanups
- [ ] `useChat` invalidates `["chat", vaultHash]`, but chat is local state, not a query — remove or back chat with a query.
      ref: `hooks/use-portfolios.ts:44-50`

---

## 3. Tests & CI

### P1 · CI pipeline (none exists)
- [ ] Add `.github/workflows/frontend.yml`: `pnpm install`, `pnpm lint`, `pnpm build`
      (build type-checks). (No `.github/` directory exists yet.)
- [ ] Add a `typecheck` script (`tsc --noEmit`) so type errors fail fast without a full build.
      ref: `package.json:5-10` (scripts are dev/build/start/lint — no `typecheck`/`test` yet)

### P2 · Component tests
- [ ] Test `lib/format.ts` (BigInt fixed-point formatting — the only numeric code in the client)
      and the create/deposit flows with a mocked wallet provider.
      ref: `lib/format.ts`, `lib/casper-wallet.d.ts`

---

## Definition of done (per task)
- `pnpm lint` + `pnpm build` (or `typecheck`) pass.
- No golden rule (1–5) violated — re-check the `🔴` lines: user actions only, no
  money math, no secrets (only `NEXT_PUBLIC_*`), don't re-derive the target, no
  sensitive data in browser storage.
- New reads go through `lib/api.ts`; new user actions go through `lib/casper.ts`
  (and only user actions — never an agent action).
- The demo panel stays wired and visually separate; rebalance rationale stays
  rendered inline in the activity view.
