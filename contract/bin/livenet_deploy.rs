//! Casper testnet deploy runner (Odra livenet).
//!
//! Reads `contract/.env`:
//!   ODRA_CASPER_LIVENET_NODE_ADDRESS, ODRA_CASPER_LIVENET_CHAIN_NAME,
//!   ODRA_CASPER_LIVENET_SECRET_KEY_PATH
//!
//! Run from the `contract/` dir:
//!   cargo run --bin livenet_deploy --features livenet -- preflight  # print deployer, no submit
//!   cargo run --bin livenet_deploy --features livenet -- one        # deploy registry only (smoke)
//!   cargo run --bin livenet_deploy --features livenet               # full infra deploy + wiring

use odra::casper_types::U256;
use odra::host::{Deployer, NoArgs};
use odra::prelude::*;

use stigma_contracts::oracle::{PriceOracle, PriceOracleInitArgs};
use stigma_contracts::registry::VaultRegistry;
use stigma_contracts::router::{Router, RouterInitArgs};
use stigma_contracts::token::{MockToken, MockTokenInitArgs};

const CSPR: u64 = 1_000_000_000; // motes per CSPR
const GAS_DEPLOY: u64 = 350 * CSPR;
const GAS_CALL: u64 = 5 * CSPR;

fn usd6(d: u64) -> U256 {
    U256::from(d) * U256::from(1_000_000u64)
}

fn main() {
    let env = odra_casper_livenet_env::env();
    let mode = std::env::args().nth(1).unwrap_or_default();
    println!("mode: {}", if mode.is_empty() { "full" } else { &mode });
    println!("deployer (caller): {:?}", env.caller());

    if mode == "preflight" {
        println!("preflight only — nothing submitted.");
        return;
    }

    if mode == "one" {
        env.set_gas(GAS_DEPLOY);
        let registry = VaultRegistry::deploy(&env, NoArgs);
        println!("VaultRegistry: {}", registry.address().to_string());
        println!("smoke deploy ok.");
        return;
    }

    // ---- tokens (canonical order; only mUSDC has a faucet) ----
    let token_meta = [
        ("Mock USDC", "mUSDC", true),
        ("Mock BTC", "mBTC", false),
        ("Mock NVDAx", "mNVDAx", false),
        ("Mock Gold", "mXAUT", false),
        ("Mock GOOGLx", "mGOOGLx", false),
    ];
    let prices = [usd6(1), usd6(65_000), usd6(100), usd6(2_000), usd6(150)];

    let mut tokens = Vec::new();
    for (name, symbol, faucet) in token_meta {
        env.set_gas(GAS_DEPLOY);
        let t = MockToken::deploy(
            &env,
            MockTokenInitArgs {
                name: name.to_string(),
                symbol: symbol.to_string(),
                decimals: 6,
                faucet_enabled: faucet,
            },
        );
        println!("{symbol}: {}", t.address().to_string());
        tokens.push(t);
    }

    // ---- oracle + router + registry ----
    env.set_gas(GAS_DEPLOY);
    let mut oracle = PriceOracle::deploy(&env, PriceOracleInitArgs { keeper: env.caller() });
    println!("PriceOracle: {}", oracle.address().to_string());

    env.set_gas(GAS_DEPLOY);
    let router = Router::deploy(
        &env,
        RouterInitArgs {
            oracle: oracle.address(),
        },
    );
    println!("Router: {}", router.address().to_string());

    env.set_gas(GAS_DEPLOY);
    let registry = VaultRegistry::deploy(&env, NoArgs);
    println!("VaultRegistry: {}", registry.address().to_string());

    // ---- wire mint authority + seed prices ----
    for (i, token) in tokens.iter_mut().enumerate() {
        env.set_gas(GAS_CALL);
        token.set_minter(router.address());
        env.set_gas(GAS_CALL);
        oracle.set_price(token.address(), prices[i]);
        println!("wired {}", token.address().to_string());
    }

    println!("\n=== DONE — export to ../backend/.env and ../frontend/.env ===");
    println!("ORACLE_HASH={}", oracle.address().to_string());
    println!("ROUTER_HASH={}", router.address().to_string());
    println!("VAULT_REGISTRY_HASH={}", registry.address().to_string());
    for (i, (_, symbol, _)) in token_meta.iter().enumerate() {
        println!(
            "TOKEN_{}_HASH={}",
            symbol.to_uppercase(),
            tokens[i].address().to_string()
        );
    }
}
