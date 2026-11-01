//! Read-only views. The website and the CLI use only these.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

use crate::types::{Record, Stats, TokenVolume};
use crate::{record_id, Contract, ContractExt};

pub const MAX_LIST_LIMIT: u32 = 50;

#[near]
impl Contract {
    pub fn get_record(&self, sender: AccountId, key: String) -> Option<Record> {
        self.records.get(&record_id(&sender, &key)).cloned()
    }

    /// Same as `get_record`; kept as the name the SDK polls.
    pub fn get_by_key(&self, sender: AccountId, key: String) -> Option<Record> {
        self.get_record(sender, key)
    }

    pub fn list_records(&self, sender: AccountId, from: Option<u32>, limit: Option<u32>) -> Vec<Record> {
        let Some(keys) = self.sender_keys.get(&sender) else {
            return Vec::new();
        };
        let from = from.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(MAX_LIST_LIMIT).min(MAX_LIST_LIMIT) as usize;
        keys.iter()
            .skip(from)
            .take(limit)
            .filter_map(|k| self.records.get(&record_id(&sender, k)).cloned())
            .collect()
    }

    pub fn get_stats(&self) -> Stats {
        let mut volume: Vec<TokenVolume> = self
            .volume
            .iter()
            .map(|(token, v)| TokenVolume {
                token: token.clone(),
                forwarded: U128(*v),
            })
            .collect();
        volume.sort_by(|a, b| a.token.cmp(&b.token));
        Stats {
            records_created: self.next_number.saturating_sub(1),
            refusals: self.refusals,
            volume,
        }
    }
}
