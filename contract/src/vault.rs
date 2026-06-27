//! The Vault — the source of truth for one portfolio's money state, and where the
//! glide-path target is computed on-chain.
//!
//! 🔴 Access control (CLAUDE.md, this is law):
//! - `owner`: `deposit`, `withdraw`, `withdraw_all`, `update_config`.
//! - `agent`: `execute_buy`, `rebalance` ONLY — and it supplies NO amounts; every
//!   amount is derived in-contract from balances + the computed target. There is
//!   no agent-reachable path that moves funds out of the vault.
//!
//! Money: all mock tokens and oracle prices are fixed-point 6 dp; weights are bps
//! (Σ = 10000). Integer math only. Assets are held as CEP-18 balances (the vault
//! address is the holder) and addressed by canonical index ([0] = mUSDC).

use odra::casper_types::U256;
use odra::prelude::*;
use odra::ContractRef;

use crate::constants::{
    end_allocation, glide_target, sum_bps, year_from_unix_secs, Profile, BPS_TOTAL, MUSDC_INDEX,
    SLIPPAGE_BPS,
};
use crate::oracle::PriceOracleContractRef;
use crate::router::RouterContractRef;
use crate::token::MockTokenContractRef;

/// Tokens + prices are 6 dp, so value(usd6) = amount * price / 10^6.
const USD_SCALE: u64 = 1_000_000;

#[odra::odra_error]
pub enum VaultError {
    /// Caller is neither the required `owner` nor `agent`.
    Unauthorized = 33_001,
    /// `Σ(allocation) != 10000`.
    BadAllocationSum = 33_002,
    /// Allocation length doesn't match the asset set.
    BadAllocationLen = 33_003,
    /// Not enough mUSDC to satisfy a withdrawal.
    InsufficientFunds = 33_004,
    /// A required field was never initialized.
    NotConfigured = 33_005,
}

#[odra::event]
pub struct Deposited {
    pub owner: Address,
    pub amount: U256,
}

#[odra::event]
pub struct Bought {
    pub idle_spent: U256,
}

#[odra::event]
pub struct Rebalanced {
    pub total_value_usd: U256,
}

#[odra::event]
pub struct Withdrawn {
    pub owner: Address,
    pub amount: U256,
}

#[odra::event]
pub struct ConfigUpdated {
    pub target_amount_usd: U256,
    pub target_year: u32,
}

/// The merged read shape returned by `view_state` (mirrors what the backend
/// relays to the UI). `current_target` is the glide-adjusted target computed here.
#[odra::odra_type]
pub struct VaultState {
    pub owner: Address,
    pub agent: Address,
    pub profile: Profile,
    pub base_allocation: Vec<u32>,
    pub current_target: Vec<u32>,
    pub holdings: Vec<U256>,
    pub target_amount_usd: U256,
    pub target_year: u32,
    pub created_year: u32,
}

#[odra::module(
    events = [Deposited, Bought, Rebalanced, Withdrawn, ConfigUpdated],
    errors = VaultError
)]
pub struct Vault {
    owner: Var<Address>,
    agent: Var<Address>,
    profile: Var<Profile>,
    base_allocation: Var<Vec<u32>>,
    target_amount_usd: Var<U256>,
    target_year: Var<u32>,
    created_year: Var<u32>,
    oracle: Var<Address>,
    router: Var<Address>,
    /// Canonical asset addresses; `[MUSDC_INDEX]` is mUSDC.
    assets: Var<Vec<Address>>,
}

#[odra::module]
impl Vault {
    #[allow(clippy::too_many_arguments)]
    pub fn init(
        &mut self,
        owner: Address,
        agent: Address,
        profile: Profile,
        base_allocation: Vec<u32>,
        target_amount_usd: U256,
        target_year: u32,
        oracle: Address,
        router: Address,
        assets: Vec<Address>,
    ) {
        self.validate_allocation(&base_allocation, assets.len());
        self.owner.set(owner);
        self.agent.set(agent);
        self.profile.set(profile);
        self.base_allocation.set(base_allocation);
        self.target_amount_usd.set(target_amount_usd);
        self.target_year.set(target_year);
        self.created_year
            .set(year_from_unix_secs(self.env().get_block_time_secs()));
        self.oracle.set(oracle);
        self.router.set(router);
        self.assets.set(assets);
    }

    /* ------------------------------ owner ------------------------------ */

    /// Escrow `amount` mUSDC into the vault (owner must have approved the vault).
    pub fn deposit(&mut self, amount: U256) {
        let owner = self.assert_owner();
        let me = self.env().self_address();
        let mut token = MockTokenContractRef::new(self.env(), self.musdc());
        token.transfer_from(&owner, &me, &amount);
        self.env().emit_event(Deposited { owner, amount });
    }

    /// Sell all holdings to mUSDC, then send `amount` to the owner.
    pub fn withdraw(&mut self, amount: U256) {
        let owner = self.assert_owner();
        self.liquidate_to_musdc();
        let me = self.env().self_address();
        let mut token = MockTokenContractRef::new(self.env(), self.musdc());
        if token.balance_of(&me) < amount {
            self.env().revert(VaultError::InsufficientFunds);
        }
        token.transfer(&owner, &amount);
        self.env().emit_event(Withdrawn { owner, amount });
    }

    /// Sell all holdings to mUSDC and send the entire balance to the owner.
    pub fn withdraw_all(&mut self) {
        let owner = self.assert_owner();
        self.liquidate_to_musdc();
        let me = self.env().self_address();
        let mut token = MockTokenContractRef::new(self.env(), self.musdc());
        let bal = token.balance_of(&me);
        if !bal.is_zero() {
            token.transfer(&owner, &bal);
        }
        self.env().emit_event(Withdrawn { owner, amount: bal });
    }

    /// Edit the allocation / goal. Re-validates `Σ == 10000`.
    pub fn update_config(
        &mut self,
        base_allocation: Vec<u32>,
        target_amount_usd: U256,
        target_year: u32,
    ) {
        self.assert_owner();
        let n = self.assets().len();
        self.validate_allocation(&base_allocation, n);
        self.base_allocation.set(base_allocation);
        self.target_amount_usd.set(target_amount_usd);
        self.target_year.set(target_year);
        self.env().emit_event(ConfigUpdated {
            target_amount_usd,
            target_year,
        });
    }

    /* --------------------- agent (trigger-only) ------------------------ */

    /// Allocate idle mUSDC across the current target. Agent supplies no amounts.
    pub fn execute_buy(&mut self) {
        self.assert_agent();
        let assets = self.assets();
        let me = self.env().self_address();
        let musdc = assets[MUSDC_INDEX];
        let idle = MockTokenContractRef::new(self.env(), musdc).balance_of(&me);
        if idle.is_zero() {
            return;
        }
        let target = self.current_target();
        let router = self.router_addr();
        for i in 0..assets.len() {
            if i == MUSDC_INDEX {
                continue;
            }
            let spend = idle * U256::from(target[i]) / U256::from(BPS_TOTAL);
            if spend.is_zero() {
                continue;
            }
            let min_out = self.min_out(router, musdc, assets[i], spend);
            RouterContractRef::new(self.env(), router).swap(musdc, assets[i], spend, min_out);
        }
        self.env().emit_event(Bought { idle_spent: idle });
    }

    /// Move holdings toward the exact computed target (sell legs, then buy legs).
    pub fn rebalance(&mut self) {
        self.assert_agent();
        let assets = self.assets();
        let me = self.env().self_address();
        let n = assets.len();
        let oracle = self.oracle_addr();
        let router = self.router_addr();

        let mut prices: Vec<U256> = Vec::with_capacity(n);
        let mut values: Vec<U256> = Vec::with_capacity(n);
        let mut total = U256::zero();
        {
            let o = PriceOracleContractRef::new(self.env(), oracle);
            for asset in &assets {
                let p = o.get_price(asset);
                let b = MockTokenContractRef::new(self.env(), *asset).balance_of(&me);
                let v = b * p / U256::from(USD_SCALE);
                total += v;
                prices.push(p);
                values.push(v);
            }
        }
        if total.is_zero() {
            return;
        }
        let target = self.current_target();
        let musdc = assets[MUSDC_INDEX];

        // Sell legs: non-mUSDC above target -> mUSDC.
        for i in 0..n {
            if i == MUSDC_INDEX {
                continue;
            }
            let target_value = total * U256::from(target[i]) / U256::from(BPS_TOTAL);
            if values[i] > target_value {
                let sell_value = values[i] - target_value;
                let sell_amount = sell_value * U256::from(USD_SCALE) / prices[i];
                if sell_amount.is_zero() {
                    continue;
                }
                let min_out = self.min_out(router, assets[i], musdc, sell_amount);
                RouterContractRef::new(self.env(), router).swap(
                    assets[i],
                    musdc,
                    sell_amount,
                    min_out,
                );
            }
        }

        // Buy legs: mUSDC -> non-mUSDC below target, capped by idle mUSDC.
        for i in 0..n {
            if i == MUSDC_INDEX {
                continue;
            }
            let target_value = total * U256::from(target[i]) / U256::from(BPS_TOTAL);
            if target_value > values[i] {
                let buy_value = target_value - values[i];
                let mut spend = buy_value * U256::from(USD_SCALE) / prices[MUSDC_INDEX];
                let idle = MockTokenContractRef::new(self.env(), musdc).balance_of(&me);
                if spend > idle {
                    spend = idle;
                }
                if spend.is_zero() {
                    continue;
                }
                let min_out = self.min_out(router, musdc, assets[i], spend);
                RouterContractRef::new(self.env(), router).swap(musdc, assets[i], spend, min_out);
            }
        }
        self.env().emit_event(Rebalanced {
            total_value_usd: total,
        });
    }

    /* ------------------------------ views ------------------------------ */

    /// Holdings + the on-chain-computed glide target + config.
    pub fn view_state(&self) -> VaultState {
        VaultState {
            owner: self.owner_addr(),
            agent: self.agent_addr(),
            profile: self.profile_val(),
            base_allocation: self.base(),
            current_target: self.current_target(),
            holdings: self.holdings(),
            target_amount_usd: self.target_amount_usd.get().unwrap_or_default(),
            target_year: self.target_year.get().unwrap_or_default(),
            created_year: self.created_year.get().unwrap_or_default(),
        }
    }

    /// The current glide-adjusted target allocation (bps). Computed, never stored.
    pub fn current_target(&self) -> Vec<u32> {
        let base = self.base();
        let end = end_allocation(&self.profile_val());
        let created = self.created_year.get().unwrap_or_default();
        let target_year = self.target_year.get().unwrap_or_default();
        let current = year_from_unix_secs(self.env().get_block_time_secs());
        glide_target(&base, &end, created, target_year, current)
    }
}

impl Vault {
    /* -------- guards -------- */
    fn assert_owner(&self) -> Address {
        let owner = self.owner_addr();
        if self.env().caller() != owner {
            self.env().revert(VaultError::Unauthorized);
        }
        owner
    }

    fn assert_agent(&self) -> Address {
        let agent = self.agent_addr();
        if self.env().caller() != agent {
            self.env().revert(VaultError::Unauthorized);
        }
        agent
    }

    /* -------- storage readers -------- */
    fn owner_addr(&self) -> Address {
        self.owner.get_or_revert_with(VaultError::NotConfigured)
    }
    fn agent_addr(&self) -> Address {
        self.agent.get_or_revert_with(VaultError::NotConfigured)
    }
    fn oracle_addr(&self) -> Address {
        self.oracle.get_or_revert_with(VaultError::NotConfigured)
    }
    fn router_addr(&self) -> Address {
        self.router.get_or_revert_with(VaultError::NotConfigured)
    }
    fn profile_val(&self) -> Profile {
        self.profile.get_or_revert_with(VaultError::NotConfigured)
    }
    fn base(&self) -> Vec<u32> {
        self.base_allocation.get().unwrap_or_default()
    }
    fn assets(&self) -> Vec<Address> {
        self.assets.get().unwrap_or_default()
    }
    fn musdc(&self) -> Address {
        self.assets()[MUSDC_INDEX]
    }

    /* -------- helpers -------- */
    fn holdings(&self) -> Vec<U256> {
        let assets = self.assets();
        let me = self.env().self_address();
        let mut out = Vec::with_capacity(assets.len());
        for a in &assets {
            out.push(MockTokenContractRef::new(self.env(), *a).balance_of(&me));
        }
        out
    }

    /// `min_out = quote * (10000 - SLIPPAGE_BPS) / 10000` (hard slippage cap).
    fn min_out(
        &self,
        router: Address,
        token_in: Address,
        token_out: Address,
        amount_in: U256,
    ) -> U256 {
        let quote =
            RouterContractRef::new(self.env(), router).quote(&token_in, &token_out, amount_in);
        quote * U256::from(BPS_TOTAL - SLIPPAGE_BPS) / U256::from(BPS_TOTAL)
    }

    fn liquidate_to_musdc(&mut self) {
        let assets = self.assets();
        let me = self.env().self_address();
        let musdc = assets[MUSDC_INDEX];
        let router = self.router_addr();
        for (i, asset) in assets.iter().enumerate() {
            if i == MUSDC_INDEX {
                continue;
            }
            let bal = MockTokenContractRef::new(self.env(), *asset).balance_of(&me);
            if bal.is_zero() {
                continue;
            }
            let min_out = self.min_out(router, *asset, musdc, bal);
            RouterContractRef::new(self.env(), router).swap(*asset, musdc, bal, min_out);
        }
    }

    fn validate_allocation(&self, alloc: &[u32], asset_len: usize) {
        if alloc.len() != asset_len {
            self.env().revert(VaultError::BadAllocationLen);
        }
        if sum_bps(alloc) != BPS_TOTAL {
            self.env().revert(VaultError::BadAllocationSum);
        }
    }
}
