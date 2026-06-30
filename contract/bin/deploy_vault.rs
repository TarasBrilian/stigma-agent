//! Per-vault deploy runner (Odra livenet).
//!
//! Deploys ONE `Vault` to a live Casper network and records it via the
//! permissionless `VaultRegistry.register`. This is the reproducible counterpart
//! to `scripts/deploy.sh` (which only plans the SHARED infra), and the runbook
//! for the user-signed `Vault.wasm` deploy in ADR 0001 (same init args/order —
//! a user-signed deploy in the frontend produces an identical vault).
//!
//! It also doubles as the on-chain SMOKE TEST (contract `docs/TASK.md` P0):
//! with `VAULT_SMOKE=1` it funds the vault (faucet → approve → deposit) and
//! triggers `execute_buy`, proving the deployed token/router/oracle wiring
//! actually executes a swap without reverting.
//!
//! 🔴 This deploys + registers a vault only. It NEVER signs an agent withdraw or
//! any fund-moving deploy with a backend key (golden rules #1/#4): the smoke path
//! moves funds strictly as the *owner* (deposit) and the *agent* (execute_buy),
//! both of which are the single deployer key here — see the owner==agent guard.
//!
//! Run (needs a FUNDED testnet key — cannot run in CI):
//!
//! ```bash
//! cd contract
//! set -a && . ./.env && set +a            # loads ODRA_CASPER_LIVENET_* (node, chain, key)
//! cargo run --bin deploy_vault --features livenet
//! ```
//!
//! Infra hashes default from `deployed.casper-test.json` (`env_for_backend`) — the
//! single source of truth — so nothing is copied into env. Override any with an
//! env var of the same name (`ORACLE_HASH`, `ROUTER_HASH`, `VAULT_REGISTRY_HASH`,
//! `TOKEN_{MUSDC,MBTC,MNVDAX,MXAUT,MGOOGLX}_HASH`) to target a different
//! deployment, or point `DEPLOYED_JSON` at another file. Always required:
//! `ODRA_CASPER_LIVENET_{NODE_ADDRESS,CHAIN_NAME,SECRET_KEY_PATH}` (from `.env`).
//!
//! Optional vault params: `VAULT_OWNER`, `VAULT_AGENT` (default: the deployer
//! account — must both equal the deployer for the single-key smoke path),
//! `VAULT_PROFILE` (`Conservative|Moderate|Aggressive`, default `Moderate`),
//! `VAULT_BASE_ALLOCATION` (5 comma-separated bps in canonical order, Σ=10000,
//! default `0,2000,3000,4000,1000`), `VAULT_TARGET_AMOUNT_USD` (whole dollars,
//! default `100000`), `VAULT_TARGET_YEAR` (default `2040`).
//!
//! Gas (motes; tune if a deploy is under-funded): `DEPLOY_GAS` (default 600 CSPR),
//! `CALL_GAS` (default 20 CSPR), `BUY_GAS` (default 100 CSPR for `execute_buy`).
//! Smoke: `VAULT_SMOKE=1`, `SMOKE_DEPOSIT_USD` (default 10000).
//!
//! Read-only verify (no deploy, no gas): `VAULT_READ=<vault hash>` prints the
//! vault's on-chain token balances and whether the registry lists it. The normal
//! flow runs this same check automatically after deploy/smoke.

use std::process::exit;
use std::str::FromStr;

use odra::casper_types::U256;
use odra::host::{Deployer, HostRefLoader};
use odra::prelude::{Address, Addressable};

use stigma_contracts::constants::{Profile, ASSET_COUNT, BPS_TOTAL, MUSDC_INDEX};
use stigma_contracts::registry::VaultRegistry;
use stigma_contracts::token::MockToken;
use stigma_contracts::vault::{Vault, VaultInitArgs};

const CSPR: u64 = 1_000_000_000; // motes per CSPR

fn main() {
    let env = odra_casper_livenet_env::env();

    // ---- infra addresses ----
    // Default source: `deployed.casper-test.json` (`env_for_backend`), the single
    // source of truth for the deployed shared infra — so the hashes live in ONE
    // place, not copied into this repo's env. An env var of the same name (the
    // backend/.env names) overrides, e.g. to target a different deployment.
    let deployed = load_deployed();
    let oracle = infra_addr("ORACLE_HASH", &deployed);
    let router = infra_addr("ROUTER_HASH", &deployed);
    let registry_addr = infra_addr("VAULT_REGISTRY_HASH", &deployed);
    // Canonical asset order: [mUSDC, mBTC, mNVDAx, mXAUT, mGOOGLx]; [0] = mUSDC.
    let assets: Vec<Address> = vec![
        infra_addr("TOKEN_MUSDC_HASH", &deployed),
        infra_addr("TOKEN_MBTC_HASH", &deployed),
        infra_addr("TOKEN_MNVDAX_HASH", &deployed),
        infra_addr("TOKEN_MXAUT_HASH", &deployed),
        infra_addr("TOKEN_MGOOGLX_HASH", &deployed),
    ];
    assert_eq!(assets.len(), ASSET_COUNT, "asset count must be canonical");

    // ---- vault params ----
    let deployer = env.get_account(0); // derived from ODRA_CASPER_LIVENET_SECRET_KEY_PATH
    let owner = opt_addr("VAULT_OWNER").unwrap_or(deployer);

    // ---- read-only verification mode: VAULT_READ=<vault hash>, no deploy, no gas ----
    if let Some(vh) = opt("VAULT_READ") {
        verify(
            &env,
            addr_from("VAULT_READ", &vh),
            owner,
            &assets,
            registry_addr,
        );
        return;
    }

    let agent = opt_addr("VAULT_AGENT").unwrap_or(deployer);
    let profile = parse_profile(&opt("VAULT_PROFILE").unwrap_or_else(|| "Moderate".into()));
    let base_allocation =
        parse_bps(&opt("VAULT_BASE_ALLOCATION").unwrap_or_else(|| "0,2000,3000,4000,1000".into()));
    let target_amount_usd = usd6(parse_u64("VAULT_TARGET_AMOUNT_USD", 100_000));
    let target_year = parse_u64("VAULT_TARGET_YEAR", 2040) as u32;

    let deploy_gas = parse_u64("DEPLOY_GAS", 600 * CSPR);
    let call_gas = parse_u64("CALL_GAS", 20 * CSPR);

    println!("== deploy_vault ==");
    println!("deployer : {}", deployer.to_string());
    println!("owner    : {}", owner.to_string());
    println!("agent    : {}", agent.to_string());
    println!("profile  : {profile:?}");
    println!(
        "base bps : {base_allocation:?}  (Σ={})",
        base_allocation.iter().sum::<u32>()
    );
    println!(
        "goal     : ${} by {target_year}",
        parse_u64("VAULT_TARGET_AMOUNT_USD", 100_000)
    );

    // ---- deploy the vault (Σ==10000 + asset membership validated in Vault::init) ----
    env.set_gas(deploy_gas);
    let vault = match Vault::try_deploy(
        &env,
        VaultInitArgs {
            owner,
            agent,
            profile,
            base_allocation,
            target_amount_usd,
            target_year,
            oracle,
            router,
            assets: assets.clone(),
        },
    ) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("vault deploy FAILED: {e:?}");
            eprintln!("(check Σ(base_allocation)==10000, the infra hashes, and DEPLOY_GAS)");
            exit(1);
        }
    };
    let vault_addr = vault.address();
    println!("\nvault deployed: {}", vault_addr.to_string());

    // ---- register it (permissionless, moves no funds; not the agent key) ----
    env.set_gas(call_gas);
    let mut registry = VaultRegistry::load(&env, registry_addr);
    if let Err(e) = registry.try_register(owner, vault_addr) {
        eprintln!("register FAILED: {e:?}");
        exit(1);
    }
    println!(
        "registered in VaultRegistry under owner {}",
        owner.to_string()
    );

    println!("\nNext: report it to the backend (it also calls register, idempotently):");
    println!(
        "  POST /portfolios {{ \"owner\": \"{}\", \"vaultHash\": \"{}\", ... }}",
        owner.to_string(),
        vault_addr.to_string()
    );

    // ---- optional smoke test: prove a real swap executes ----
    if opt("VAULT_SMOKE").as_deref() == Some("1") {
        smoke(&env, vault, &assets, owner, agent, deployer, call_gas);
    }

    // ---- verify the on-chain result (gas-free view reads) ----
    verify(&env, vault_addr, owner, &assets, registry_addr);
}

/// Gas-free correctness check. Odra livenet runs `&self` entrypoints host-side
/// against queried global state (no deploy), so this reads the REAL on-chain
/// state: the vault's per-token balances (proving `execute_buy` moved funds) and
/// that the registry lists the vault under its owner. Reads `balance_of` directly
/// (not `view_state`) to stay independent of the vault's own glide logic.
fn verify(
    env: &odra::host::HostEnv,
    vault_addr: Address,
    owner: Address,
    assets: &[Address],
    registry_addr: Address,
) {
    const SYMS: [&str; ASSET_COUNT] = ["mUSDC", "mBTC", "mNVDAx", "mXAUT", "mGOOGLx"];
    println!("\n== verify (gas-free on-chain reads) ==");
    println!("vault: {}", vault_addr.to_string());
    println!("holdings (raw 6dp):");
    for (i, asset) in assets.iter().enumerate() {
        let bal = MockToken::load(env, *asset).balance_of(&vault_addr);
        println!("  {:<7} {}", SYMS[i], bal);
    }
    let listed = VaultRegistry::load(env, registry_addr)
        .list_vaults(&owner)
        .contains(&vault_addr);
    println!("registry lists this vault under owner: {listed}");
}

/// faucet → approve → deposit → execute_buy, all driven by the single deployer
/// key. Requires owner == agent == deployer (we only hold the one key here).
fn smoke(
    env: &odra::host::HostEnv,
    mut vault: stigma_contracts::vault::VaultHostRef,
    assets: &[Address],
    owner: Address,
    agent: Address,
    deployer: Address,
    call_gas: u64,
) {
    println!("\n== smoke (VAULT_SMOKE=1) ==");
    if owner != deployer || agent != deployer {
        println!(
            "skipped: smoke needs owner==agent==deployer (only the deployer key is \
             loaded). Re-run without VAULT_OWNER/VAULT_AGENT to use the deployer for both."
        );
        return;
    }

    let deposit = usd6(parse_u64("SMOKE_DEPOSIT_USD", 10_000));
    let buy_gas = parse_u64("BUY_GAS", 100 * CSPR);
    let mut musdc = MockToken::load(env, assets[MUSDC_INDEX]);
    let vault_addr = vault.address();

    env.set_caller(deployer);

    env.set_gas(call_gas);
    if let Err(e) = musdc.try_faucet_mint(deposit) {
        eprintln!("faucet_mint FAILED: {e:?}");
        exit(1);
    }
    env.set_gas(call_gas);
    if let Err(e) = musdc.try_approve(&vault_addr, &deposit) {
        eprintln!("approve FAILED: {e:?}");
        exit(1);
    }
    env.set_gas(call_gas);
    if let Err(e) = vault.try_deposit(deposit) {
        eprintln!("deposit FAILED: {e:?}");
        exit(1);
    }
    println!(
        "deposited ${} mUSDC into the vault",
        parse_u64("SMOKE_DEPOSIT_USD", 10_000)
    );

    // The agent trigger. Success here (no revert) IS the smoke pass: it proves
    // set_minter(router) is wired and the oracle is seeded (execute_buy swaps
    // idle mUSDC into the target assets via the Router).
    env.set_gas(buy_gas);
    match vault.try_execute_buy() {
        Ok(_) => println!("execute_buy OK — idle mUSDC swapped into assets ✔ (wiring proven)"),
        Err(e) => {
            eprintln!("execute_buy FAILED: {e:?}");
            eprintln!("(likely the token minter isn't the Router, or a price is unset)");
            exit(1);
        }
    }
}

/* ------------------------------ small helpers ------------------------------ */

fn opt(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

fn addr_from(key: &str, raw: &str) -> Address {
    Address::from_str(raw).unwrap_or_else(|_| {
        eprintln!("{key} is not a valid Casper address: {raw}");
        exit(1);
    })
}

fn opt_addr(key: &str) -> Option<Address> {
    opt(key).map(|raw| addr_from(key, &raw))
}

/// Load `deployed.casper-test.json` (next to `Cargo.toml`) if present, so infra
/// hashes can be read from the single source of truth. A missing/unparseable file
/// is fine — env vars are then required. `DEPLOYED_JSON` overrides the path.
fn load_deployed() -> Option<serde_json::Value> {
    let path = opt("DEPLOYED_JSON")
        .unwrap_or_else(|| format!("{}/deployed.casper-test.json", env!("CARGO_MANIFEST_DIR")));
    let raw = std::fs::read_to_string(&path).ok()?;
    match serde_json::from_str(&raw) {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("warning: could not parse {path}: {e}");
            None
        }
    }
}

/// Resolve an infra package hash: env-var override → `env_for_backend[key]` in
/// the deployed JSON. Exits if neither provides it.
fn infra_addr(key: &str, deployed: &Option<serde_json::Value>) -> Address {
    let raw = opt(key).or_else(|| {
        deployed
            .as_ref()
            .and_then(|d| d["env_for_backend"][key].as_str())
            .map(str::to_string)
    });
    match raw {
        Some(raw) => addr_from(key, &raw),
        None => {
            eprintln!("missing {key}: set it in the env or in deployed.casper-test.json");
            exit(1);
        }
    }
}

fn parse_u64(key: &str, default: u64) -> u64 {
    match opt(key) {
        Some(v) => v.parse().unwrap_or_else(|_| {
            eprintln!("{key} must be a number, got: {v}");
            exit(1);
        }),
        None => default,
    }
}

/// Whole dollars → raw 6-dp USD.
fn usd6(dollars: u64) -> U256 {
    U256::from(dollars) * U256::from(1_000_000u64)
}

fn parse_profile(s: &str) -> Profile {
    match s.trim().to_ascii_lowercase().as_str() {
        "conservative" => Profile::Conservative,
        "moderate" => Profile::Moderate,
        "aggressive" => Profile::Aggressive,
        other => {
            eprintln!("VAULT_PROFILE must be Conservative|Moderate|Aggressive, got: {other}");
            exit(1);
        }
    }
}

/// Parse comma-separated bps (e.g. "0,2000,3000,4000,1000"). The contract
/// re-validates Σ==10000 + length at deploy; we only surface obvious mistakes.
fn parse_bps(s: &str) -> Vec<u32> {
    let v: Vec<u32> = s
        .split(',')
        .map(|p| {
            p.trim().parse().unwrap_or_else(|_| {
                eprintln!("VAULT_BASE_ALLOCATION has a non-numeric entry: {p:?}");
                exit(1);
            })
        })
        .collect();
    if v.len() != ASSET_COUNT {
        eprintln!(
            "VAULT_BASE_ALLOCATION needs {ASSET_COUNT} entries, got {}",
            v.len()
        );
        exit(1);
    }
    let sum: u32 = v.iter().sum();
    if sum != BPS_TOTAL {
        eprintln!("VAULT_BASE_ALLOCATION must sum to {BPS_TOTAL} bps, got {sum}");
        exit(1);
    }
    v
}
