//! Integration tests on OdraVM: deploy the full system and exercise the real
//! cross-contract lifecycle, including the security invariant that the agent can
//! trigger buys/rebalances but can NEVER withdraw.
#![cfg(test)]

use odra::casper_types::U256;
use odra::host::{Deployer, HostEnv};
use odra::prelude::*;

use crate::constants::Profile;
use crate::oracle::{PriceOracle, PriceOracleHostRef, PriceOracleInitArgs};
use crate::router::{Router, RouterInitArgs};
use crate::token::{MockToken, MockTokenHostRef, MockTokenInitArgs};
use crate::vault::{Vault, VaultHostRef, VaultInitArgs};

/// Whole dollars -> raw 6-dp USD.
fn usd6(dollars: u64) -> U256 {
    U256::from(dollars) * U256::from(1_000_000u64)
}

struct Sys {
    env: HostEnv,
    owner: Address,
    agent: Address,
    tokens: Vec<MockTokenHostRef>,
    oracle: PriceOracleHostRef,
    vault: VaultHostRef,
    prices: Vec<U256>,
}

fn deploy_token(env: &HostEnv, name: &str, symbol: &str, faucet: bool) -> MockTokenHostRef {
    MockToken::deploy(
        env,
        MockTokenInitArgs {
            name: name.into(),
            symbol: symbol.into(),
            decimals: 6,
            faucet_enabled: faucet,
        },
    )
}

fn setup() -> Sys {
    let env = odra_test::env();
    let deployer = env.get_account(0);
    let owner = env.get_account(1);
    let agent = env.get_account(2);
    env.set_caller(deployer);

    // Canonical order: [mUSDC, mBTC, mNVDAx, mXAUT, mGOOGLx]; only mUSDC has a faucet.
    let mut tokens = alloc::vec![
        deploy_token(&env, "Mock USDC", "mUSDC", true),
        deploy_token(&env, "Mock BTC", "mBTC", false),
        deploy_token(&env, "Mock NVDAx", "mNVDAx", false),
        deploy_token(&env, "Mock Gold", "mXAUT", false),
        deploy_token(&env, "Mock GOOGLx", "mGOOGLx", false),
    ];

    let mut oracle = PriceOracle::deploy(&env, PriceOracleInitArgs { keeper: deployer });
    let router = Router::deploy(
        &env,
        RouterInitArgs {
            oracle: oracle.address(),
        },
    );

    // Wire the router as the mint/burn authority and set reference prices (6 dp).
    let prices = alloc::vec![
        usd6(1),      // mUSDC
        usd6(65_000), // mBTC
        usd6(100),    // mNVDAx
        usd6(2_000),  // mXAUT
        usd6(150),    // mGOOGLx
    ];
    for (i, token) in tokens.iter_mut().enumerate() {
        token.set_minter(router.address());
        oracle.set_price(token.address(), prices[i]);
    }

    let assets: Vec<Address> = tokens.iter().map(|t| t.address()).collect();
    let vault = Vault::deploy(
        &env,
        VaultInitArgs {
            owner,
            agent,
            profile: Profile::Moderate,
            // Moderate start: mBTC 20 · mNVDAx 30 · mXAUT 40 · mGOOGLx 10.
            base_allocation: alloc::vec![0, 2000, 3000, 4000, 1000],
            target_amount_usd: usd6(100_000),
            target_year: 2040,
            oracle: oracle.address(),
            router: router.address(),
            assets,
        },
    );

    Sys {
        env,
        owner,
        agent,
        tokens,
        oracle,
        vault,
        prices,
    }
}

/// Total vault value in raw USD (6 dp) from current holdings × reference prices.
fn total_value(sys: &Sys) -> U256 {
    let holdings = sys.vault.view_state().holdings;
    let mut total = U256::zero();
    for (i, h) in holdings.iter().enumerate() {
        total += *h * sys.prices[i] / U256::from(1_000_000u64);
    }
    total
}

#[test]
fn full_lifecycle_and_agent_cannot_withdraw() {
    let mut sys = setup();
    let vault_addr = sys.vault.address();

    // --- owner funds the vault: faucet -> approve -> deposit ---
    sys.env.set_caller(sys.owner);
    sys.tokens[0].faucet_mint(usd6(10_000));
    sys.tokens[0].approve(&vault_addr, &usd6(10_000));
    sys.vault.deposit(usd6(10_000));
    assert_eq!(sys.tokens[0].balance_of(&vault_addr), usd6(10_000));
    assert_eq!(sys.tokens[0].balance_of(&sys.owner), U256::zero());

    // --- agent triggers the buy (no amounts supplied) ---
    sys.env.set_caller(sys.agent);
    sys.vault.execute_buy();
    // Idle mUSDC was deployed into assets; value is conserved (mock swaps are
    // value-neutral at oracle prices).
    assert!(
        sys.tokens[1].balance_of(&vault_addr) > U256::zero(),
        "bought mBTC"
    );
    let value = total_value(&sys);
    // Value-neutral up to per-leg integer-division dust (<$1 across the legs).
    assert!(
        value <= usd6(10_000) && value >= usd6(9_999),
        "value conserved: {value}"
    );

    // --- a price moves; agent rebalances back to target (must not revert) ---
    sys.env.set_caller(sys.env.get_account(0)); // keeper
    sys.oracle.set_price(sys.tokens[1].address(), usd6(80_000)); // mBTC up
    sys.env.set_caller(sys.agent);
    sys.vault.rebalance();

    // --- 🔴 security invariant: agent CANNOT withdraw, owner CANNOT execute_buy ---
    sys.env.set_caller(sys.agent);
    assert!(
        sys.vault.try_withdraw_all().is_err(),
        "agent must not withdraw"
    );
    sys.env.set_caller(sys.owner);
    assert!(
        sys.vault.try_execute_buy().is_err(),
        "owner must not execute_buy"
    );

    // --- owner withdraws everything back to mUSDC ---
    sys.env.set_caller(sys.owner);
    sys.vault.withdraw_all();
    assert!(
        sys.tokens[0].balance_of(&sys.owner) > usd6(9_900),
        "owner got funds back"
    );
    assert_eq!(total_value(&sys), U256::zero(), "vault emptied");
}

#[test]
fn rejects_bad_allocation() {
    let env = odra_test::env();
    let owner = env.get_account(1);
    let agent = env.get_account(2);
    let oracle = PriceOracle::deploy(&env, PriceOracleInitArgs { keeper: owner });
    let router = Router::deploy(
        &env,
        RouterInitArgs {
            oracle: oracle.address(),
        },
    );
    let assets: Vec<Address> = alloc::vec![oracle.address(); 5]; // placeholder addresses

    // Σ != 10000 must be rejected at init.
    let res = Vault::try_deploy(
        &env,
        VaultInitArgs {
            owner,
            agent,
            profile: Profile::Conservative,
            base_allocation: alloc::vec![1, 2, 3, 4, 5],
            target_amount_usd: usd6(1),
            target_year: 2040,
            oracle: oracle.address(),
            router: router.address(),
            assets,
        },
    );
    assert!(res.is_err(), "bad allocation sum must revert");
}
