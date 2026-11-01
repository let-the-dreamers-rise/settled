//! `ft_on_transfer`: the check order is fixed and is the product.
//!
//! 1. parse `msg`                         -> MALFORMED_MSG, no state
//! 2. predecessor in allowed tokens       -> TOKEN_NOT_ALLOWED, no state
//! 3. duplicate `(sender, key)`           -> DUPLICATE_KEY, `refused_count += 1`
//! 4. deadline in `msg` already passed    -> EXPIRED_DEADLINE, no state
//! 5. enough gas to forward and callback  -> INSUFFICIENT_GAS, no state
//! 6. insert the record, forward, callback
//!
//! Every refusal returns the full amount as unused, so the token contract refunds the payer
//! in the same transaction. The token check runs before any record is read, because any
//! account can call `ft_on_transfer` with any `sender_id`.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::ext_storage_management;
use near_sdk::json_types::U128;
use near_sdk::{env, log, near, AccountId, Gas, NearToken, PromiseOrValue, PromiseResult};

use crate::types::{is_valid_key, Forward, Outcome, PayMsg, Record, Refusal, MAX_HASH_LEN};
use crate::{record_id, Contract, ContractExt};

pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
pub const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(5);
pub const GAS_ON_FORWARD: Gas = Gas::from_tgas(10);
/// Work done in this receipt before the promises are scheduled, with margin.
pub const GAS_RECEIVER_SELF: Gas = Gas::from_tgas(5);
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// Storage deposit for registering a deposit address on a NEP-141 token (0.00125 NEAR).
pub const STORAGE_DEPOSIT: NearToken = NearToken::from_yoctonear(1_250_000_000_000_000_000_000);

fn required_gas(register: bool) -> Gas {
    let base = GAS_FT_TRANSFER.as_gas() + GAS_ON_FORWARD.as_gas() + GAS_RECEIVER_SELF.as_gas();
    let extra = if register { GAS_STORAGE_DEPOSIT.as_gas() } else { 0 };
    Gas::from_gas(base + extra)
}

fn refuse(reason: Refusal, amount: U128, number: Option<u64>) -> PromiseOrValue<U128> {
    match number {
        Some(n) => log!("settled:refused reason={} record={}", reason.as_str(), n),
        None => log!("settled:refused reason={}", reason.as_str()),
    }
    PromiseOrValue::Value(amount)
}

fn parse_msg(msg: &str) -> Option<PayMsg> {
    let parsed: PayMsg = near_sdk::serde_json::from_str(msg).ok()?;
    if !is_valid_key(&parsed.key)
        || parsed.quote_hash.is_empty()
        || parsed.quote_hash.len() > MAX_HASH_LEN
    {
        return None;
    }
    Some(parsed)
}

#[near]
impl FungibleTokenReceiver for Contract {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        // 1. parse
        let Some(pay) = parse_msg(&msg) else {
            return refuse(Refusal::MalformedMsg, amount, None);
        };
        // 2. token
        let token = env::predecessor_account_id();
        if !self.volume.contains_key(&token) {
            return refuse(Refusal::TokenNotAllowed, amount, None);
        }
        // 3. duplicate key
        let id = record_id(&sender_id, &pay.key);
        if let Some(existing) = self.records.get_mut(&id) {
            if existing.forward != Forward::ForwardFailed {
                existing.refused_count += 1;
                let number = existing.number;
                self.refusals += 1;
                return refuse(Refusal::DuplicateKey, amount, Some(number));
            }
        }
        // 4. deadline
        if pay.deadline_ms <= env::block_timestamp_ms() {
            return refuse(Refusal::ExpiredDeadline, amount, None);
        }
        // 5. gas
        let available = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        if available < required_gas(pay.register_deposit_address).as_gas() {
            return refuse(Refusal::InsufficientGas, amount, None);
        }
        // 6. insert, then forward
        self.insert_record(&id, &sender_id, &token, amount, &pay);
        PromiseOrValue::Promise(self.forward(sender_id, token, amount, pay))
    }
}

impl Contract {
    fn insert_record(
        &mut self,
        id: &str,
        sender: &AccountId,
        token: &AccountId,
        amount: U128,
        pay: &PayMsg,
    ) {
        let reused = self.records.contains_key(id);
        let number = self.next_number;
        self.next_number += 1;
        let record = Record {
            number,
            sender: sender.clone(),
            key: pay.key.clone(),
            token: token.clone(),
            amount,
            quote_hash: pay.quote_hash.clone(),
            deposit_address: pay.deposit_address.clone(),
            deadline_ms: pay.deadline_ms,
            forward: Forward::Forwarding,
            outcome: Outcome::Pending,
            refused_count: 0,
            created_at_ms: env::block_timestamp_ms(),
            resolved_at_ms: None,
            evidence: None,
        };
        self.records.insert(id.to_string(), record);
        if !reused {
            let keys = self.sender_keys.entry(sender.clone()).or_default();
            keys.push(pay.key.clone());
        }
        log!(
            "settled:record number={} sender={} key={}",
            number,
            sender,
            pay.key
        );
    }

    fn forward(
        &self,
        sender: AccountId,
        token: AccountId,
        amount: U128,
        pay: PayMsg,
    ) -> near_sdk::Promise {
        // 1Click ToS s.4.1(h): the transfer names the originating payer, unmasked.
        let memo = Some(format!("settled:payer={} key={}", sender, pay.key));
        let transfer = ext_ft_core::ext(token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(pay.deposit_address.clone(), amount, memo);
        let first = if pay.register_deposit_address {
            ext_storage_management::ext(token)
                .with_attached_deposit(STORAGE_DEPOSIT)
                .with_static_gas(GAS_STORAGE_DEPOSIT)
                .storage_deposit(Some(pay.deposit_address.clone()), Some(true))
                .then(transfer)
        } else {
            transfer
        };
        first.then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_ON_FORWARD)
                .on_forward(sender, pay.key, amount),
        )
    }
}

#[near]
impl Contract {
    /// Callback after the transfer to the deposit address. Returns the unused amount to the
    /// token contract: 0 when forwarded, the full amount when the transfer failed.
    #[private]
    pub fn on_forward(&mut self, sender: AccountId, key: String, amount: U128) -> U128 {
        // `ft_transfer` returns no value, so read the raw result instead of deserializing ().
        let transferred = matches!(env::promise_result(0), PromiseResult::Successful(_));
        let id = record_id(&sender, &key);
        let Some(record) = self.records.get_mut(&id) else {
            return amount;
        };
        let number = record.number;
        let token = record.token.clone();
        if transferred {
            record.forward = Forward::Forwarded;
            let total = self.volume.get(&token).copied().unwrap_or(0);
            self.volume.insert(token, total.saturating_add(amount.0));
            log!("settled:forwarded record={}", number);
            U128(0)
        } else {
            record.forward = Forward::ForwardFailed;
            log!("settled:forward_failed record={}", number);
            amount
        }
    }
}
