//! Settled: a retry through this contract with the same key never pays twice.
//!
//! A payer sends tokens with `ft_transfer_call(token, settled, amount, msg)`. In
//! `ft_on_transfer` the contract either refuses (returning the full amount as unused, so the
//! token contract refunds it in the same transaction) or records the payment and forwards the
//! tokens to the 1Click deposit address named in `msg`. A separate watcher account writes the
//! outcome with `resolve`.
//!
//! Limits, stated plainly: an agent holding a full-access key can still call `ft_transfer`
//! straight to a deposit address; the quote hash is stored, not verified; the outcome record is
//! as trustworthy as the watcher key.

mod receiver;
mod resolve;
pub mod types;
mod views;

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

pub use types::*;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Records,
    SenderKeys,
    Volume,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner: AccountId,
    watcher: AccountId,
    /// Records keyed by `"<sender>|<key>"`.
    records: LookupMap<String, Record>,
    /// Keys per sender, in creation order, for `list_records`.
    sender_keys: LookupMap<AccountId, Vec<String>>,
    /// Allowed tokens and the volume forwarded for each.
    volume: IterableMap<AccountId, u128>,
    next_number: u64,
    refusals: u64,
}

pub(crate) fn record_id(sender: &AccountId, key: &str) -> String {
    format!("{}|{}", sender, key)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, watcher: AccountId, allowed_tokens: Vec<AccountId>) -> Self {
        let mut volume = IterableMap::new(StorageKey::Volume);
        for token in allowed_tokens {
            volume.insert(token, 0u128);
        }
        Self {
            owner,
            watcher,
            records: LookupMap::new(StorageKey::Records),
            sender_keys: LookupMap::new(StorageKey::SenderKeys),
            volume,
            next_number: 1,
            refusals: 0,
        }
    }

    pub fn add_allowed_token(&mut self, token: AccountId) {
        self.assert_owner();
        if !self.volume.contains_key(&token) {
            self.volume.insert(token, 0u128);
        }
    }

    pub fn set_watcher(&mut self, watcher: AccountId) {
        self.assert_owner();
        self.watcher = watcher;
    }

    pub fn get_watcher(&self) -> AccountId {
        self.watcher.clone()
    }

    pub fn get_allowed_tokens(&self) -> Vec<AccountId> {
        self.volume.keys().cloned().collect()
    }
}

impl Contract {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "settled: owner only"
        );
    }
}

#[cfg(test)]
mod tests;
