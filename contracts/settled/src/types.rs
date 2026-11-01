//! Record, outcome and message types. The borsh layout of `Record` and the JSON shape of
//! `Stats` are frozen by the `state_layout_snapshot` test: changing them after the final
//! mainnet deploy means a fresh contract account.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// Where the tokens went after `ft_on_transfer` accepted a new key.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Forward {
    /// Record written, `ft_transfer` to the deposit address in flight.
    Forwarding,
    /// The token contract confirmed the transfer to the deposit address.
    Forwarded,
    /// The transfer failed; the payer was refunded and the key may be reused.
    ForwardFailed,
}

/// The payer-side outcome, written by the watcher. Five values, complete from the start.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Outcome {
    Pending,
    Incomplete,
    Settled,
    Refunded,
    FailedNoRefund,
}

impl Outcome {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Outcome::Settled | Outcome::Refunded | Outcome::FailedNoRefund
        )
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Record {
    pub number: u64,
    pub sender: AccountId,
    pub key: String,
    pub token: AccountId,
    pub amount: U128,
    pub quote_hash: String,
    pub deposit_address: AccountId,
    pub deadline_ms: u64,
    pub forward: Forward,
    pub outcome: Outcome,
    pub refused_count: u32,
    pub created_at_ms: u64,
    pub resolved_at_ms: Option<u64>,
    pub evidence: Option<String>,
}

/// The JSON `msg` an SDK puts in `ft_transfer_call`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PayMsg {
    pub key: String,
    pub quote_hash: String,
    pub deposit_address: AccountId,
    pub deadline_ms: u64,
    /// Register the deposit address on the token with `storage_deposit` before the transfer.
    #[serde(default)]
    pub register_deposit_address: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenVolume {
    pub token: AccountId,
    pub forwarded: U128,
}

/// Counts over this contract's own state only.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stats {
    pub records_created: u64,
    pub refusals: u64,
    pub volume: Vec<TokenVolume>,
}

/// Refusal reasons, logged as `settled:refused reason=<R>`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    MalformedMsg,
    TokenNotAllowed,
    DuplicateKey,
    ExpiredDeadline,
    InsufficientGas,
}

impl Refusal {
    pub fn as_str(self) -> &'static str {
        match self {
            Refusal::MalformedMsg => "MALFORMED_MSG",
            Refusal::TokenNotAllowed => "TOKEN_NOT_ALLOWED",
            Refusal::DuplicateKey => "DUPLICATE_KEY",
            Refusal::ExpiredDeadline => "EXPIRED_DEADLINE",
            Refusal::InsufficientGas => "INSUFFICIENT_GAS",
        }
    }
}

pub const MAX_KEY_LEN: usize = 64;
pub const MAX_HASH_LEN: usize = 128;
pub const MAX_EVIDENCE_LEN: usize = 2048;

/// Keys are short, printable and free of separators that would confuse logs.
pub fn is_valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= MAX_KEY_LEN
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}
