//! On-chain vault registry (owner -> their vaults).
//!
//! FEASIBILITY NOTE: ARCHITECTURE.md describes a `VaultFactory` that *deploys*
//! each `Vault`. Casper/Odra has no contract-deploys-contract primitive (unlike
//! EVM `CREATE`), so each `Vault` is deployed individually (off-chain / by the
//! backend) and recorded here. The security model is unchanged: every vault still
//! has its own `owner` + `agent` and custodies its own funds.

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
