//! Mock price oracle — the single source of price truth (raw USD, 6 dp). Fed by
//! the backend keeper and overridable for live demos. Testnet only.

use odra::casper_types::U256;
use odra::prelude::*;

#[odra::odra_error]
pub enum OracleError {
    /// Caller is not the keeper.
    NotKeeper = 31_001,
    /// No price has been set for the token.
    PriceUnset = 31_002,
}

/// Emitted on every price write (indexed by the backend).
#[odra::event]
pub struct PriceSet {
    pub token: Address,
    pub price: U256,
}

#[odra::module(events = [PriceSet], errors = OracleError)]
pub struct PriceOracle {
    keeper: Var<Address>,
    /// Raw USD price (6 dp) per token address.
    prices: Mapping<Address, U256>,
}

#[odra::module]
impl PriceOracle {
    pub fn init(&mut self, keeper: Address) {
        self.keeper.set(keeper);
    }

    /// Set a token's price (raw USD, 6 dp). Keeper only.
    pub fn set_price(&mut self, token: Address, price: U256) {
        self.assert_keeper();
        self.prices.set(&token, price);
        self.env().emit_event(PriceSet { token, price });
    }

    /// Get a token's price (raw USD, 6 dp). Reverts if unset.
    pub fn get_price(&self, token: &Address) -> U256 {
        match self.prices.get(token) {
            Some(p) => p,
            None => self.env().revert(OracleError::PriceUnset),
        }
    }

    pub fn keeper(&self) -> Address {
        self.read_keeper()
    }
}

impl PriceOracle {
    fn read_keeper(&self) -> Address {
        match self.keeper.get() {
            Some(k) => k,
            None => self.env().revert(OracleError::NotKeeper),
        }
    }

    fn assert_keeper(&self) {
        if self.env().caller() != self.read_keeper() {
            self.env().revert(OracleError::NotKeeper);
        }
    }
}
