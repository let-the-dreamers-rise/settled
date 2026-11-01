//! Unit tests (no sandbox). The named behaviour tests live in `tests/sandbox.rs`.

use near_sdk::json_types::U128;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, Gas, PromiseOrValue};

use crate::types::*;
use crate::Contract;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, gas_tgas: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("settled.test.near"))
        .predecessor_account_id(acc(predecessor))
        .block_timestamp(1_000_000_000_000) // 1_000_000 ms
        .prepaid_gas(Gas::from_tgas(gas_tgas));
    b
}

fn contract() -> Contract {
    testing_env!(ctx("owner.test.near", 300).build());
    Contract::new(
        acc("owner.test.near"),
        acc("watcher.test.near"),
        vec![acc("usdc.test.near")],
    )
}

fn msg(key: &str, deadline_ms: u64) -> String {
    format!(
        r#"{{"key":"{key}","quote_hash":"abc123","deposit_address":"deposit.test.near","deadline_ms":{deadline_ms}}}"#
    )
}

fn refused_amount(r: PromiseOrValue<U128>) -> Option<u128> {
    match r {
        PromiseOrValue::Value(v) => Some(v.0),
        PromiseOrValue::Promise(_) => None,
    }
}

#[test]
fn key_validation() {
    assert!(is_valid_key("invoice-4417"));
    assert!(is_valid_key("a:b.c_d"));
    assert!(!is_valid_key(""));
    assert!(!is_valid_key("has space"));
    assert!(!is_valid_key("pipe|sep"));
    assert!(!is_valid_key(&"x".repeat(MAX_KEY_LEN + 1)));
}

#[test]
fn malformed_msg_writes_nothing() {
    use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
    let mut c = contract();
    testing_env!(ctx("usdc.test.near", 300).build());
    let r = c.ft_on_transfer(acc("alice.test.near"), U128(5), "not json".into());
    assert_eq!(refused_amount(r), Some(5));
    assert!(get_logs()[0].contains("reason=MALFORMED_MSG"));
    assert_eq!(c.get_stats().records_created, 0);
}

#[test]
fn token_check_runs_before_duplicate_check() {
    use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
    let mut c = contract();
    testing_env!(ctx("usdc.test.near", 300).build());
    let r = c.ft_on_transfer(acc("alice.test.near"), U128(5), msg("k1", 9_999_999_999));
    assert_eq!(refused_amount(r), None, "new key is forwarded");
    testing_env!(ctx("evil.test.near", 300).build());
    let r = c.ft_on_transfer(acc("alice.test.near"), U128(5), msg("k1", 9_999_999_999));
    assert_eq!(refused_amount(r), Some(5));
    assert!(get_logs()[0].contains("reason=TOKEN_NOT_ALLOWED"));
    let rec = c.get_record(acc("alice.test.near"), "k1".into()).unwrap();
    assert_eq!(rec.refused_count, 0);
    assert_eq!(c.get_stats().refusals, 0);
}

#[test]
fn insufficient_gas_writes_nothing() {
    use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
    let mut c = contract();
    testing_env!(ctx("usdc.test.near", 10).build());
    let r = c.ft_on_transfer(acc("alice.test.near"), U128(5), msg("k1", 9_999_999_999));
    assert_eq!(refused_amount(r), Some(5));
    assert!(get_logs()[0].contains("reason=INSUFFICIENT_GAS"));
    assert!(c.get_record(acc("alice.test.near"), "k1".into()).is_none());
}

/// Freezes the borsh layout of `Record`, the five-value outcome enum and the `get_stats` JSON
/// shape. Regenerate only before the final deploy: `UPDATE_SNAPSHOTS=1 cargo test`.
#[test]
fn state_layout_snapshot() {
    let record = Record {
        number: 7,
        sender: acc("alice.near"),
        key: "invoice-4417".into(),
        token: acc("usdc.near"),
        amount: U128(2_000_000),
        quote_hash: "ab12".into(),
        deposit_address: acc("deposit.near"),
        deadline_ms: 1_700_000_000_000,
        forward: Forward::Forwarded,
        outcome: Outcome::Settled,
        refused_count: 1,
        created_at_ms: 1_699_999_999_000,
        resolved_at_ms: Some(1_700_000_000_500),
        evidence: Some("{\"status\":\"SUCCESS\"}".into()),
    };
    let borsh_hex: String = near_sdk::borsh::to_vec(&record)
        .unwrap()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let outcomes: Vec<String> = [
        Outcome::Pending,
        Outcome::Incomplete,
        Outcome::Settled,
        Outcome::Refunded,
        Outcome::FailedNoRefund,
    ]
    .iter()
    .map(|o| near_sdk::serde_json::to_string(o).unwrap())
    .collect();
    let stats = Stats {
        records_created: 1,
        refusals: 1,
        volume: vec![TokenVolume {
            token: acc("usdc.near"),
            forwarded: U128(2_000_000),
        }],
    };
    let actual = format!(
        "record_borsh={borsh_hex}\nrecord_json={}\noutcomes={}\nstats_json={}\n",
        near_sdk::serde_json::to_string(&record).unwrap(),
        outcomes.join(","),
        near_sdk::serde_json::to_string(&stats).unwrap()
    );
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/layout.txt");
    if std::env::var("UPDATE_SNAPSHOTS").is_ok() {
        std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots")).unwrap();
        std::fs::write(path, &actual).unwrap();
    }
    let expected = std::fs::read_to_string(path).expect("snapshot missing; run with UPDATE_SNAPSHOTS=1");
    assert_eq!(actual, expected, "state layout changed; a fresh contract account is needed");
}
