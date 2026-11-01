//! `resolve`: the watcher writes the outcome. Only the watcher account, only after the forward
//! succeeded, and terminal outcomes are never overwritten.

use near_sdk::{env, log, near, require, AccountId};

use crate::types::{Forward, Outcome, MAX_EVIDENCE_LEN};
use crate::{record_id, Contract, ContractExt};

#[near]
impl Contract {
    pub fn resolve(
        &mut self,
        sender: AccountId,
        key: String,
        outcome: Outcome,
        evidence: Option<String>,
    ) {
        require!(
            env::predecessor_account_id() == self.watcher,
            "settled: watcher only"
        );
        if let Some(ev) = &evidence {
            require!(ev.len() <= MAX_EVIDENCE_LEN, "settled: evidence too long");
        }
        let id = record_id(&sender, &key);
        let record = self
            .records
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("settled: no such record"));
        require!(
            record.forward == Forward::Forwarded,
            "settled: record was not forwarded"
        );
        require!(
            !record.outcome.is_terminal(),
            "settled: terminal outcome cannot be overwritten"
        );
        record.outcome = outcome;
        record.evidence = evidence;
        if outcome.is_terminal() {
            record.resolved_at_ms = Some(env::block_timestamp_ms());
        }
        log!(
            "settled:resolved record={} outcome={:?}",
            record.number,
            outcome
        );
    }
}
