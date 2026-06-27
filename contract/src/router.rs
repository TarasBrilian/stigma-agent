//! Mock oracle-priced router. Swaps without real liquidity by burning the input
//! token and minting the output (it holds mint/burn authority on the mock tokens,
//! wired via `MockToken::set_minter`). Every swap is slippage-capped (CLAUDE.md).

use odra::casper_types::U256;
use odra::prelude::*;
use odra::ContractRef;

use crate::oracle::PriceOracleContractRef;
use crate::token::MockTokenContractRef;

#[odra::odra_error]
pub enum RouterError {
    /// `amount_out` fell below the caller's `min_out`.
    SlippageExceeded = 32_001,
    /// `amount_in` was zero.
    ZeroAmount = 32_002,
    /// The oracle address has not been set.
    OracleUnset = 32_003,
}

/// Emitted on every executed swap.
#[odra::event]
pub struct Swapped {
    pub trader: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: U256,
    pub amount_out: U256,
}

#[odra::module(events = [Swapped], errors = RouterError)]
pub struct Router {
    oracle: Var<Address>,
}

#[odra::module]
impl Router {
    pub fn init(&mut self, oracle: Address) {
        self.oracle.set(oracle);
    }

    /// `amount_out = amount_in * price(in) / price(out)`; reverts if `< min_out`.
    /// Burns `token_in` from the caller and mints `token_out` to the caller.
    pub fn swap(
        &mut self,
        token_in: Address,
        token_out: Address,
        amount_in: U256,
        min_out: U256,
    ) -> U256 {
        if amount_in.is_zero() {
            self.env().revert(RouterError::ZeroAmount);
        }
        let trader = self.env().caller();
        let amount_out = self.quote(&token_in, &token_out, amount_in);
        if amount_out < min_out {
            self.env().revert(RouterError::SlippageExceeded);
        }
        let mut t_in = MockTokenContractRef::new(self.env(), token_in);
        t_in.burn(&trader, &amount_in);
        let mut t_out = MockTokenContractRef::new(self.env(), token_out);
        t_out.mint(&trader, &amount_out);
        self.env().emit_event(Swapped {
            trader,
            token_in,
            token_out,
            amount_in,
            amount_out,
        });
        amount_out
    }

    /// Quote `token_in -> token_out` for `amount_in` without executing.
    pub fn quote(&self, token_in: &Address, token_out: &Address, amount_in: U256) -> U256 {
        let oracle = PriceOracleContractRef::new(self.env(), self.read_oracle());
        let price_in = oracle.get_price(token_in);
        let price_out = oracle.get_price(token_out);
        amount_in * price_in / price_out
    }

    pub fn oracle(&self) -> Address {
        self.read_oracle()
    }
}

impl Router {
    fn read_oracle(&self) -> Address {
        match self.oracle.get() {
            Some(a) => a,
            None => self.env().revert(RouterError::OracleUnset),
        }
    }
}
