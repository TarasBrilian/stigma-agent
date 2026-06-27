#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
extern crate alloc;

pub mod constants;
pub mod oracle;
pub mod registry;
pub mod router;
pub mod token;
pub mod vault;

#[cfg(test)]
mod tests;
