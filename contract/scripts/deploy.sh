#!/usr/bin/env bash
#
# Build + deploy plan for the Stigma Agent contracts.
#
# This script builds the WASM and prints the canonical deploy order, the post-
# deploy wiring, and where to export the resulting contract hashes. The actual
# on-chain submission is left as explicit steps because it needs `casper-client`
# (or an Odra livenet runner) plus a FUNDED testnet key — neither of which can be
# exercised in CI. Do the deploys with the tool you have set up, then paste the
# hashes into the two env files noted below.
#
# Usage: ./scripts/deploy.sh [casper-test]
set -euo pipefail

NETWORK="${1:-casper-test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building WASM (release)…"
cargo odra build

echo
echo "WASM written to $ROOT/wasm/:"
ls -1 wasm/*.wasm 2>/dev/null || true

cat <<'PLAN'

============================================================
DEPLOY ORDER (network: tokens -> oracle -> router -> registry; vaults via runner)
============================================================

Canonical asset order (index matters — shared with backend/frontend):
  [0] mUSDC   (faucet_enabled = true)
  [1] mBTC
  [2] mNVDAx
  [3] mXAUT
  [4] mGOOGLx

1. Deploy MockToken.wasm x5 (init: name, symbol, decimals=6, faucet_enabled).
     - only mUSDC gets faucet_enabled = true.
2. Deploy PriceOracle.wasm   (init: keeper = backend keeper key).
3. Deploy Router.wasm        (init: oracle = <PriceOracle hash>).
4. Deploy VaultRegistry.wasm (init: —).
5. WIRE the mint/burn authority: for EACH of the 5 tokens call
        MockToken.set_minter(<Router hash>)
   as the deployer (the initial minter). Without this the Router cannot
   mint/burn and execute_buy / rebalance / withdraw will revert.
6. Seed prices: PriceOracle.set_price(<token>, <usd_6dp>) for each token
   (mUSDC = 1_000_000). The backend keeper then keeps them fresh.

Vaults are NOT deployed here — they are per-user (one Vault each) and there is no
factory (Casper has no contract-creates-contract primitive; see registry.rs and
ADR 0001). Deploy + register one with the dedicated runner, which submits the
Vault.wasm module-bytes deploy with the init args and then calls
VaultRegistry.register(owner, vault):

    set -a && . ./.env && set +a                        # livenet creds; infra hashes
    cargo run --bin deploy_vault --features livenet     # come from deployed.casper-test.json
    #                                                     add VAULT_SMOKE=1 to also test a swap

That runner is the runbook for the ADR-0001 user-signed deploy (identical init
args/order) and for manual operator testing. See bin/deploy_vault.rs.

============================================================
EXPORT HASHES (propagate downstream — see contract/CLAUDE.md "Hash propagation")
============================================================

  ../backend/.env :
     ORACLE_HASH, ROUTER_HASH, VAULT_REGISTRY_HASH,
     TOKEN_MUSDC_HASH, TOKEN_MBTC_HASH, TOKEN_MNVDAX_HASH,
     TOKEN_MXAUT_HASH, TOKEN_MGOOGLX_HASH, AGENT_PUBLIC_KEY
  ../frontend/.env  (per ADR 0001 — the USER signs the Vault.wasm deploy, so the
                     UI needs every Vault::init arg; it does NOT need the registry
                     hash, since the backend calls register and reads go via backend):
     NEXT_PUBLIC_AGENT_PUBLIC_KEY, NEXT_PUBLIC_ORACLE_HASH, NEXT_PUBLIC_ROUTER_HASH,
     NEXT_PUBLIC_TOKEN_MUSDC_HASH, NEXT_PUBLIC_TOKEN_MBTC_HASH,
     NEXT_PUBLIC_TOKEN_MNVDAX_HASH, NEXT_PUBLIC_TOKEN_MXAUT_HASH,
     NEXT_PUBLIC_TOKEN_MGOOGLX_HASH
     (NEXT_PUBLIC_VAULT_FACTORY_HASH is removed — no factory exists.)

PLAN

if ! command -v casper-client >/dev/null 2>&1; then
  echo "NOTE: casper-client not found — install it and fund a ${NETWORK} key to submit the deploys above."
fi
