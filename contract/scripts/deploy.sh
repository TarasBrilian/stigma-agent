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
DEPLOY ORDER (network: tokens -> oracle -> router -> registry -> vaults)
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

Vaults are deployed per user (init: owner, agent, profile, base_allocation,
target_amount_usd, target_year, oracle, router, assets[5]) and recorded via
VaultRegistry.register(owner, vault). (See registry.rs — the factory "deploys"
in ARCHITECTURE.md become per-vault deploys, since Casper has no on-chain
contract-creates-contract primitive.)

============================================================
EXPORT HASHES (propagate downstream — see contract/CLAUDE.md "Hash propagation")
============================================================

  ../backend/.env :
     ORACLE_HASH, ROUTER_HASH, VAULT_REGISTRY_HASH,
     TOKEN_MUSDC_HASH, TOKEN_MBTC_HASH, TOKEN_MNVDAX_HASH,
     TOKEN_MXAUT_HASH, TOKEN_MGOOGLX_HASH, AGENT_PUBLIC_KEY
  ../frontend/.env :
     NEXT_PUBLIC_VAULT_REGISTRY_HASH (+ any hashes the UI displays)

PLAN

if ! command -v casper-client >/dev/null 2>&1; then
  echo "NOTE: casper-client not found — install it and fund a ${NETWORK} key to submit the deploys above."
fi
