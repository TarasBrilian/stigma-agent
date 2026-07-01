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
      IMPLEMENTED: `buildCreateVaultDeploy` now builds the `SessionBuilder` module-bytes
      deploy of `Vault.wasm` with init args (owner = connected user, agent = `env.agentPublicKey`,
      profile, base_allocation, target_amount_usd, target_year, oracle = `env.oracleHash`,
      router = `env.routerHash`, assets = the 5 `env.tokenHashes`) PLUS Odra 2.8.2 install
      control args (`odra_cfg_package_hash_key_name`/`_allow_key_override`/`_is_upgradable`/
      `_is_upgrade`) read by the WASM `call()`. Encodings grounded in source: `Profile` → U8 tag
      (Conservative=0·Moderate=1·Aggressive=2); `Address` → Casper `Key` (accounts as `Key::Account`,
      contracts as `Key::Hash`); `base_allocation`/`assets` in canonical order. Validated by a node
      smoke-build against the real 313KB `Vault.wasm` (tx + 13 named args encode; hash produced).
      ref: `lib/casper.ts` (`buildCreateVaultDeploy`/`fetchVaultWasm`/`resolveVaultHash`, `PROFILE_TAG`)
      done: a documented decision; the builder matches it ✓
- [x] Implement `buildDepositDeploy` (the demo entry point — fund an existing vault).
      DONE: builds an unsigned Casper 2.0 `Transaction` (TransactionV1) calling
      `Vault.deposit(amount)` by package hash with a `U256` amount arg (mirrors the backend's
      `ContractCallBuilder` path). Amount is validated raw 6-dp via `assertRawUsd`.
      ref: `lib/casper.ts` (`buildDepositDeploy`)  🔴 golden rule #1 (USER action only)
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
      DONE (builder task): `Vault.wasm` is shipped to `frontend/public/Vault.wasm` and fetched at
      runtime by `fetchVaultWasm()` (`fetch("/Vault.wasm")`) for the module-bytes deploy.

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
- [x] After the profile result, let the user pick a starter, then run the ADR-0001 creation
      path: user signs the `Vault.wasm` deploy, the UI reads the new vault address, then calls
      `api.register` (`POST /portfolios`). The **backend** performs the on-chain
      `VaultRegistry.register` + the off-chain mirror; the UI does **not** sign register.
      DONE: `QuestionnaireForm` result view no longer dead-ends — it shows the starter(s) (a
      `<select>` when >1) with allocation + goal, and a "Create this vault" button runs
      `buildCreateVaultDeploy → signTransactionWithWallet → submitTransaction →
      confirmTransaction → resolveVaultHash → api.register(...)` with step-by-step status, then
      `router.push('/portfolio/<vault>')`. `resolveVaultHash` reads the new package hash from the
      deployer account's named keys (`getAccountInfo` → `namedKeys[packageHashKeyName]`). New
      `api.register` posts `{ vaultHash, owner: pubkeyHex, name, profile, baseAllocation,
      targetAmountUsd, targetYear }` (matches `RegisterPortfolioDto`). tsc + eslint + `next build` clean.
      ref: `components/QuestionnaireForm.tsx` (`createVault`); `lib/api.ts` (`register`); `lib/casper.ts`
      🔴 golden rule #1 (user actions only — on-chain register is backend's) · #2 (allocation passed as bps, validated on-chain; UI only formats)
      done: onboarding → user-signed vault deploy → address reported to backend → registered on-chain + mirrored → appears on `/dashboard` (allocation EDITING deferred; starters are already Σ=10000)
      ⚠️ live E2E pends the real Casper Wallet accepting the ~313KB `Transaction.toJSON()` session
      payload, AND `resolveVaultHash`'s named-key read against a live Casper 2.0 node (the two
      untestable-without-live-infra spots) — same caveat class as sign/submit.

### P0 · Deposit flow — approve + deposit (two signed deploys; none exists today)
`Vault.deposit` calls `transfer_from(owner → vault)`, so the owner must FIRST
**approve** the vault as a `mUSDC` spender (see the contract test: `approve` then
`deposit`). The portfolio page has no deposit UI and there is no approve builder.
- [x] Add `buildApproveDeploy(mUSDC, vault, amount)` (CEP-18 `approve`) — missing from `lib/casper.ts`.
      DONE: builds a `Transaction` calling mUSDC `approve(spender=vault as Key::Hash, amount)` by
      package hash. `mUSDC` hash from `env.tokenHashes.mUSDC`; amount validated raw 6-dp.
      ref: `lib/casper.ts` (`buildApproveDeploy`)  🔴 golden rule #1 (user action)
- [x] Add a deposit form that signs **approve then deposit**, shows pending, and reconciles via
      backend reads (~8s block time).
      DONE: `components/DepositForm.tsx` (client) — connect-wallet gate, dollar input parsed to raw
      6-dp via the new `parseUsdToRaw` (lib/format; ENCODING only, BigInt, no money math), then
      `buildApproveDeploy → sign → submit → confirmTransaction(approve) → buildDepositDeploy →
      sign → submit`. It WAITS for the approve to finalize before depositing (deposit runs
      `transfer_from`; Casper gives no submission-order guarantee, so a back-to-back deposit could
      revert) via the new `chain.confirmTransaction` (mirrors the backend's `waitForTransaction`
      revert-surfacing). Step-by-step status ("1/2 approve…", "confirming…", "2/2 deposit…"),
      shows the tx hash, then `router.refresh()` reconciles the server-rendered holdings (~1 block);
      the keeper invests the idle mUSDC afterward. Errors (wallet reject, revert) surfaced inline.
      Wired into the portfolio page's right column above Goal, visually separate from `DemoPanel`.
      ref: `components/DepositForm.tsx`; `app/portfolio/[vault]/page.tsx`; `lib/format.ts`
      (`parseUsdToRaw`); `lib/casper.ts` (`confirmTransaction`)
      🔴 golden rule #1 (user actions only) · #2 (format/encode only, no value math)
      done: a user funds a vault from the portfolio page; holdings refresh after confirmation
      ⚠️ live E2E (a real wallet-signed deposit landing on testnet) still pends the live Casper
      Wallet extension confirming the `Transaction.toJSON()` sign payload — same caveat as sign/submit.

---

## 2. Hardening & polish (P1 / P2)

### P1 · Withdraw & update-config builders + UI
- [x] Implement `buildWithdrawDeploy` and `buildUpdateConfigDeploy`, add their forms.
      DONE (last two builder stubs — the module now has ZERO `throw "not implemented"` builders,
      so the 6 stub lint-warnings are gone):
      • `buildWithdrawDeploy(pk, vault, amountOrAll)` → `Vault.withdraw(amount)` (U256) or the no-arg
        `withdraw_all()` when `"all"`; 30 CSPR gas (liquidates all holdings → transfer).
      • `buildUpdateConfigDeploy(pk, vault, {allocation, targetAmountUsd, targetYear})` →
        `update_config(base_allocation: List(U32), target_amount_usd: U256, target_year: U32)`.
        The contract requires ALL THREE (re-validates Σ==10000 + membership), so the builder takes
        the full config, not a partial patch; `base_allocation` in canonical order.
      • `WithdrawForm` (right column): amount input + "Withdraw all", with the liquidation note. Signs
        → submits → confirms → `router.refresh()`.
      • `UpdateConfigForm` (full-width section): 5 editable bps inputs (pre-filled from
        `state.baseAllocation`) with a live Σ/10000 gate, goal $ (pre-filled via new
        `usd6ToPlain`) + year. Edits the BASE allocation only (golden rule #4 — never the derived target).
      All three entry points smoke-built in node (args/hash OK). `Deploy` import dropped (all builders
      now return `Transaction`). tsc + eslint (0 warnings) + `next build` clean.
      ref: `lib/casper.ts` (`buildWithdrawDeploy`/`buildUpdateConfigDeploy`); `components/WithdrawForm.tsx`,
      `components/UpdateConfigForm.tsx`; `app/portfolio/[vault]/page.tsx`; `lib/format.ts` (`usd6ToPlain`)
      🔴 golden rule #1 (user actions only — never `execute_buy`/`rebalance`/`set_price`) · #2/#4
      ⚠️ live E2E pends the real Casper Wallet (same sign-payload caveat as the other flows).

### P1 · Optimistic UI + reconcile
- [x] After any signed deploy, show pending and reconcile against backend reads rather than
      assuming instant confirmation (~8s finality).
      DONE: every signed action runs sign → submit → **`confirmTransaction` (waits for finalization,
      surfaces reverts)** → `router.refresh()` (re-fetches the server-rendered reads). The forms show
      staged pending status ("Confirming on-chain (~8s)…") throughout, so nothing assumes instant
      confirmation. Shared for the one-sig actions via `hooks/use-signed-action.ts`; DepositForm and
      the create-vault flow apply the same pattern.
      ref: `hooks/use-signed-action.ts`; `components/{DepositForm,WithdrawForm,UpdateConfigForm}.tsx`

### P2 · Versioned questionnaire from the backend
- [ ] Replace the hardcoded `QUESTIONS` with the versioned questionnaire fetched from the API.
      ref: `components/QuestionnaireForm.tsx:17` (TODO)
      BLOCKED (cross-layer): the backend exposes NO questionnaire endpoint yet — it only *consumes*
      answers (`POST /onboarding/answers`). Needs a backend `GET /onboarding/questionnaire` (versioned)
      first; then swap `QUESTIONS` for an `api.getQuestionnaire()` fetch. Deferred to the backend task.

### P2 · Wallet UX edge states
- [x] Handle reject / timeout / no-extension / locked / active-key-change gracefully end to end.
      DONE (covered cases): no-extension → `getWalletProvider` throws a clear "install…" message that
      the `WalletButton` surfaces; reject → "Wallet connection was rejected."; connect timeout / other
      provider errors → caught in `useWallet.connect` and shown; signing cancel → `signTransactionWithWallet`
      throws "Signing was cancelled…" (the forms display it); active-key-change / lock → the mount effect
      re-syncs via `subscribeWalletEvents` and a locked read degrades to disconnected (null). The effect
      was also fixed to not setState synchronously (`react-hooks/set-state-in-effect`), with an `active`
      unmount guard. (A proactive "installed?" banner was skipped: it needs mount-time state that risks a
      hydration mismatch, and the connect-time error already informs the user.)
      ref: `lib/casper.ts` (wallet session); `hooks/use-wallet.ts`; `components/WalletButton.tsx`

### P2 · Minor cleanups
- [x] `useChat` invalidates `["chat", vaultHash]`, but chat is local state, not a query — remove or back chat with a query.
      DONE: removed the dead invalidation (and the now-unused `useQueryClient`) — the mutation just relays
      the message and returns the reply; chat stays local component state in `AgentChat`.
      ref: `hooks/use-portfolios.ts` (`useChat`)

---

## 3. Tests & CI

### P1 · CI pipeline — ✅ DONE
- [x] Add `.github/workflows/frontend.yml`: install, lint, build (build type-checks).
      DONE: `.github/workflows/frontend.yml` runs on push to `main` + PRs filtered to `frontend/**`
      (and the workflow file). Steps mirror the backend workflow: checkout → "Assert no secrets are
      committed" (repo-wide backstop) → pnpm 9 + Node 22 (pnpm cache) → `pnpm install --frozen-lockfile`
      → `pnpm lint:check` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Every step verified locally
      (frozen install in sync, lint:check 0 problems, typecheck clean, 14 tests pass, build OK).
      ref: `.github/workflows/frontend.yml`; `frontend/package.json` (`lint:check`)
- [x] Add a `typecheck` script (`tsc --noEmit`) so type errors fail fast without a full build.
      DONE: `typecheck` (`tsc --noEmit`) + `test` (`vitest run`) + `lint:check` (`eslint --max-warnings 0`)
      scripts added. ref: `package.json`

### P2 · Component tests
- [x] Test `lib/format.ts` (BigInt fixed-point formatting — the only numeric code in the client).
      DONE: `lib/format.test.ts` (vitest, Node env) — 14 tests covering `formatUsd` (grouping, half-up
      cents, cents rollover, negatives, +sign, bigint), `parseUsdToRaw` (encode + reject non-positive/
      non-numeric/>6dp), `usd6ToPlain` (+ round-trip with `parseUsdToRaw`), `bpsToPercent`/`formatBps`/
      `formatProgress` (clamp), `truncateHash`, `formatYearsLeft`. `vitest.config.ts` scopes to `lib/**`.
      ref: `lib/format.test.ts`, `vitest.config.ts`
      STILL TODO: create/deposit flow tests with a mocked wallet provider (window.CasperWalletProvider +
      casper-js-sdk stubs) — the numeric core is covered; the wallet-flow harness is a larger follow-up.

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
