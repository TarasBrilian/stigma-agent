//! On-chain vault registry (owner -> their vaults).
//!
//! FEASIBILITY NOTE: an earlier design imagined a `VaultFactory` that *deploys*
//! each `Vault`, but Casper/Odra has no contract-deploys-contract primitive
//! (unlike EVM `CREATE`). So each `Vault` is deployed individually — per ADR 0001
//! the user signs the `Vault.wasm` deploy — and recorded here via `register`,
//! which the backend calls (it is permissionless and moves no funds). The
//! security model is unchanged: every vault still has its own `owner` + `agent`
//! and custodies its own funds. See docs/decisions/0001-vault-creation-path.md.

use odra::prelude::*;

/// Emitted when a vault is registered under an owner.
#[odra::event]
pub struct VaultRegistered {
    pub owner: Address,
    pub vault: Address,
}

#[odra::module(events = [VaultRegistered])]
pub struct VaultRegistry {
    vaults: Mapping<Address, Vec<Address>>,
}

#[odra::module]
impl VaultRegistry {
    pub fn init(&mut self) {}

    /// Record a deployed `vault` under `owner` (idempotent).
    pub fn register(&mut self, owner: Address, vault: Address) {
        let mut list = self.vaults.get(&owner).unwrap_or_default();
        if !list.contains(&vault) {
            list.push(vault);
            self.vaults.set(&owner, list);
            self.env().emit_event(VaultRegistered { owner, vault });
        }
    }

    /// All vaults registered under `owner`.
    pub fn list_vaults(&self, owner: &Address) -> Vec<Address> {
        self.vaults.get(owner).unwrap_or_default()
    }
}
