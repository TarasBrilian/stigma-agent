//! Mock CEP-18 token (testnet only). Wraps odra-modules' `Cep18` and adds the
//! mint/burn authority the mock `Router` needs, plus a public `faucet_mint` for
//! demo funding (mUSDC only).
//!
//! CLAUDE.md: token mint authority lives ONLY here — gated to the `minter` (the
//! Router) for `mint`/`burn`, and to `faucet_mint` (mUSDC). Don't grant it
//! elsewhere.

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::cep18_token::Cep18;

/// Token errors (codes namespaced 30_0xx).
#[odra::odra_error]
pub enum TokenError {
    /// Caller is not the configured minter (the Router).
    NotMinter = 30_001,
    /// `faucet_mint` called on a token without the faucet enabled.
    FaucetDisabled = 30_002,
    /// The minter has not been set.
    MinterUnset = 30_003,
}

#[odra::module(errors = TokenError)]
pub struct MockToken {
    token: SubModule<Cep18>,
    /// The only address allowed to `mint`/`burn` (the Router). Starts as the
    /// deployer and is rewired via `set_minter` once the Router is deployed.
    minter: Var<Address>,
    /// Whether the public `faucet_mint` is enabled (true only for mUSDC).
    faucet_enabled: Var<bool>,
}

#[odra::module]
impl MockToken {
    pub fn init(&mut self, name: String, symbol: String, decimals: u8, faucet_enabled: bool) {
        self.minter.set(self.env().caller());
        self.faucet_enabled.set(faucet_enabled);
        // No initial supply — all minting flows through the Router / faucet.
        self.token.init(symbol, name, decimals, U256::zero());
    }

    delegate! {
        to self.token {
            fn name(&self) -> String;
            fn symbol(&self) -> String;
            fn decimals(&self) -> u8;
            fn total_supply(&self) -> U256;
            fn balance_of(&self, address: &Address) -> U256;
            fn allowance(&self, owner: &Address, spender: &Address) -> U256;
            fn approve(&mut self, spender: &Address, amount: &U256);
            fn transfer(&mut self, recipient: &Address, amount: &U256);
            fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
        }
    }

    /// Mint `amount` to `owner`. Router-only.
    pub fn mint(&mut self, owner: &Address, amount: &U256) {
        self.assert_minter();
        self.token.raw_mint(owner, amount);
    }

    /// Burn `amount` from `owner`. Router-only.
    pub fn burn(&mut self, owner: &Address, amount: &U256) {
        self.assert_minter();
        self.token.raw_burn(owner, amount);
    }

    /// Public demo faucet (mUSDC only): mint `amount` to the caller.
    pub fn faucet_mint(&mut self, amount: U256) {
        if !self.faucet_enabled.get_or_default() {
            self.env().revert(TokenError::FaucetDisabled);
        }
        let caller = self.env().caller();
        self.token.raw_mint(&caller, &amount);
    }

    /// Rewire the minter (Router) after deploy. Current minter only.
    pub fn set_minter(&mut self, minter: Address) {
        self.assert_minter();
        self.minter.set(minter);
    }

    /// The current minter (Router) address.
    pub fn minter(&self) -> Address {
        self.read_minter()
    }
}

impl MockToken {
    fn read_minter(&self) -> Address {
        match self.minter.get() {
            Some(m) => m,
            None => self.env().revert(TokenError::MinterUnset),
        }
    }

    fn assert_minter(&self) {
        if self.env().caller() != self.read_minter() {
            self.env().revert(TokenError::NotMinter);
        }
    }
}
