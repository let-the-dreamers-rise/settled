//! Named behaviour tests (spec M2), run against a local NEAR sandbox with `mock-ft`.
//! Build the wasm first: `scripts/build-contracts.sh`.

mod common;

use anyhow::Result;
use common::*;
use near_workspaces::types::{Gas, NearToken, SecretKey, KeyType, AccessKey};
use near_workspaces::Account;
use serde_json::json;

#[tokio::test]
async fn new_key_forwards_tokens() -> Result<()> {
    let env = setup().await?;
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS).await?;
    assert!(r.is_success(), "{:?}", r.failures());
    assert_eq!(used(&r), AMOUNT);
    assert!(has_log(&r, "settled:forwarded record=1"));
    // 1Click ToS s.4.1(h): the forwarded transfer names the originating payer, unmasked.
    let memo = format!("\"memo\":\"settled:payer={} key=k1\"", env.alice.id());
    assert!(has_log(&r, &memo), "forward memo must name the payer: {:?}", all_logs(&r));
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before - AMOUNT);
    assert_eq!(balance(&env.usdc, env.deposit.id().as_str()).await?, AMOUNT);
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["forward"], "FORWARDED");
    assert_eq!(rec["outcome"], "PENDING");
    Ok(())
}

#[tokio::test]
async fn duplicate_key_refused() -> Result<()> {
    let env = setup().await?;
    let dep = env.deposit.id().as_str();
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?.into_result()?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?;
    assert!(r.is_success());
    assert_eq!(used(&r), 0, "duplicate must be fully refunded");
    assert!(has_log(&r, "settled:refused reason=DUPLICATE_KEY record=1"));
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before - AMOUNT);
    assert_eq!(balance(&env.usdc, dep).await?, AMOUNT, "deposit address funded once");
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["refused_count"], 1);
    Ok(())
}

#[tokio::test]
async fn concurrent_same_key_one_forward() -> Result<()> {
    let env = setup().await?;
    let dep = env.deposit.id().as_str();
    // A second full-access key on alice gives an independent nonce, so both transactions
    // can be in flight at once.
    let sk2 = SecretKey::from_random(KeyType::ED25519);
    env.alice
        .batch(env.alice.id())
        .add_key(sk2.public_key(), AccessKey::full_access())
        .transact()
        .await?
        .into_result()?;
    let alice2 = Account::from_secret_key(env.alice.id().clone(), sk2, &env.worker);
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    let call = |a: &Account| {
        a.call(env.usdc.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": env.settled.id(),
                "amount": AMOUNT.to_string(),
                "msg": pay_msg("k-race", dep, None),
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(MAX_GAS)
    };
    let s1 = call(&env.alice).transact_async().await?;
    let s2 = call(&alice2).transact_async().await?;
    let (r1, r2) = (s1.await?, s2.await?);
    let used_total = used(&r1) + used(&r2);
    assert_eq!(used_total, AMOUNT, "exactly one payment used");
    assert_eq!(balance(&env.usdc, dep).await?, AMOUNT);
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before - AMOUNT);
    let rec = record(&env, env.alice.id().as_str(), "k-race").await?;
    assert_eq!(rec["refused_count"], 1);
    Ok(())
}

#[tokio::test]
async fn forward_failed_key_reusable() -> Result<()> {
    let env = setup().await?;
    let root = env.worker.root_account()?;
    // Not registered on the token, so `ft_transfer` to it fails.
    let unregistered = root
        .create_subaccount("unreg")
        .initial_balance(NearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;
    let dep = unregistered.id().as_str();
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?;
    assert_eq!(used(&r), 0);
    assert!(has_log(&r, "settled:forward_failed record=1"));
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before);
    assert_eq!(record(&env, env.alice.id().as_str(), "k1").await?["forward"], "FORWARD_FAILED");
    register(&env.usdc, dep).await?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?;
    assert_eq!(used(&r), AMOUNT);
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["forward"], "FORWARDED");
    assert_eq!(rec["number"], 2);
    Ok(())
}

#[tokio::test]
async fn register_deposit_address_then_forward() -> Result<()> {
    let env = setup().await?;
    let root = env.worker.root_account()?;
    let fresh = root
        .create_subaccount("fresh")
        .initial_balance(NearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;
    let msg = json!({
        "key": "k-reg",
        "quote_hash": "h",
        "deposit_address": fresh.id(),
        "deadline_ms": u64::MAX / 2,
        "register_deposit_address": true,
    })
    .to_string();
    let r = pay(&env.alice, &env.usdc, &env, msg, MAX_GAS).await?;
    assert_eq!(used(&r), AMOUNT, "{:?}", all_logs(&r));
    assert_eq!(balance(&env.usdc, fresh.id().as_str()).await?, AMOUNT);
    Ok(())
}

#[tokio::test]
async fn unauthorised_resolve_rejected() -> Result<()> {
    let env = setup().await?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS)
        .await?
        .into_result()?;
    let r = env
        .alice
        .call(env.settled.id(), "resolve")
        .args_json(json!({"sender": env.alice.id(), "key": "k1", "outcome": "SETTLED"}))
        .transact()
        .await?;
    assert!(r.is_failure());
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["outcome"], "PENDING");
    Ok(())
}

async fn resolve(env: &Env, key: &str, outcome: &str) -> Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(env
        .watcher
        .call(env.settled.id(), "resolve")
        .args_json(json!({
            "sender": env.alice.id(),
            "key": key,
            "outcome": outcome,
            "evidence": "{\"status\":\"test\"}",
        }))
        .transact()
        .await?)
}

#[tokio::test]
async fn terminal_outcome_not_overwritten() -> Result<()> {
    let env = setup().await?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS)
        .await?
        .into_result()?;
    resolve(&env, "k1", "SETTLED").await?.into_result()?;
    let r = resolve(&env, "k1", "REFUNDED").await?;
    assert!(r.is_failure());
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["outcome"], "SETTLED");
    assert!(rec["resolved_at_ms"].is_u64());
    Ok(())
}

#[tokio::test]
async fn resolve_incomplete_then_settled() -> Result<()> {
    let env = setup().await?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS)
        .await?
        .into_result()?;
    resolve(&env, "k1", "INCOMPLETE").await?.into_result()?;
    assert_eq!(record(&env, env.alice.id().as_str(), "k1").await?["outcome"], "INCOMPLETE");
    resolve(&env, "k1", "SETTLED").await?.into_result()?;
    assert_eq!(record(&env, env.alice.id().as_str(), "k1").await?["outcome"], "SETTLED");
    assert!(resolve(&env, "k1", "SETTLED").await?.is_failure());
    Ok(())
}

#[tokio::test]
async fn wrong_token_refunded() -> Result<()> {
    let env = setup().await?;
    let before = balance(&env.fake, env.alice.id().as_str()).await?;
    let r = pay(&env.alice, &env.fake, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS).await?;
    assert_eq!(used(&r), 0);
    assert!(has_log(&r, "reason=TOKEN_NOT_ALLOWED"));
    assert_eq!(balance(&env.fake, env.alice.id().as_str()).await?, before);
    assert!(record(&env, env.alice.id().as_str(), "k1").await?.is_null());
    Ok(())
}

#[tokio::test]
async fn fake_token_cannot_touch_record() -> Result<()> {
    let env = setup().await?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS)
        .await?
        .into_result()?;
    let stats_before = stats(&env).await?;
    // An attacker calls ft_on_transfer directly, naming alice as sender and her key.
    let r = env
        .bob
        .call(env.settled.id(), "ft_on_transfer")
        .args_json(json!({
            "sender_id": env.alice.id(),
            "amount": AMOUNT.to_string(),
            "msg": pay_msg("k1", env.deposit.id().as_str(), None),
        }))
        .gas(MAX_GAS)
        .transact()
        .await?;
    assert!(has_log(&r, "reason=TOKEN_NOT_ALLOWED"));
    let rec = record(&env, env.alice.id().as_str(), "k1").await?;
    assert_eq!(rec["refused_count"], 0);
    assert_eq!(stats(&env).await?, stats_before);
    // Same through a real but unallowed token contract.
    let r = pay(&env.alice, &env.fake, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS).await?;
    assert!(has_log(&r, "reason=TOKEN_NOT_ALLOWED"));
    assert_eq!(record(&env, env.alice.id().as_str(), "k1").await?["refused_count"], 0);
    assert_eq!(stats(&env).await?, stats_before);
    Ok(())
}

#[tokio::test]
async fn expired_deadline_refunded() -> Result<()> {
    let env = setup().await?;
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), Some(1)), MAX_GAS).await?;
    assert_eq!(used(&r), 0);
    assert!(has_log(&r, "reason=EXPIRED_DEADLINE"));
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before);
    assert!(record(&env, env.alice.id().as_str(), "k1").await?.is_null());
    Ok(())
}

#[tokio::test]
async fn malformed_msg_refunded() -> Result<()> {
    let env = setup().await?;
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    for bad in ["{}", "not json", r#"{"key":"has space","quote_hash":"h","deposit_address":"d.near","deadline_ms":1}"#] {
        let r = pay(&env.alice, &env.usdc, &env, bad.to_string(), MAX_GAS).await?;
        assert_eq!(used(&r), 0);
        assert!(has_log(&r, "reason=MALFORMED_MSG"));
    }
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before);
    assert_eq!(stats(&env).await?["records_created"], 0);
    Ok(())
}

#[tokio::test]
async fn keys_namespaced_by_sender() -> Result<()> {
    let env = setup().await?;
    let dep = env.deposit.id().as_str();
    let r1 = pay(&env.alice, &env.usdc, &env, pay_msg("shared", dep, None), MAX_GAS).await?;
    let r2 = pay(&env.bob, &env.usdc, &env, pay_msg("shared", dep, None), MAX_GAS).await?;
    assert_eq!(used(&r1), AMOUNT);
    assert_eq!(used(&r2), AMOUNT);
    assert_eq!(balance(&env.usdc, dep).await?, AMOUNT * 2);
    Ok(())
}

#[tokio::test]
async fn insufficient_gas_refunds() -> Result<()> {
    let env = setup().await?;
    let before = balance(&env.usdc, env.alice.id().as_str()).await?;
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), Gas::from_tgas(40)).await?;
    assert_eq!(used(&r), 0, "{:?}", all_logs(&r));
    assert_eq!(balance(&env.usdc, env.alice.id().as_str()).await?, before);
    assert!(record(&env, env.alice.id().as_str(), "k1").await?.is_null(), "key must stay usable");
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", env.deposit.id().as_str(), None), MAX_GAS).await?;
    assert_eq!(used(&r), AMOUNT);
    Ok(())
}

#[tokio::test]
async fn duplicate_key_refused_after_deadline() -> Result<()> {
    let env = setup().await?;
    let dep = env.deposit.id().as_str();
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?.into_result()?;
    // The stored quote's deadline has passed by the time of the retry.
    let r = pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, Some(1)), MAX_GAS).await?;
    assert_eq!(used(&r), 0);
    assert!(has_log(&r, "reason=DUPLICATE_KEY"));
    assert!(!has_log(&r, "reason=EXPIRED_DEADLINE"));
    assert_eq!(record(&env, env.alice.id().as_str(), "k1").await?["refused_count"], 1);
    Ok(())
}

#[tokio::test]
async fn stats_count_refusals() -> Result<()> {
    let env = setup().await?;
    let dep = env.deposit.id().as_str();
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?.into_result()?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?.into_result()?;
    pay(&env.alice, &env.usdc, &env, pay_msg("k1", dep, None), MAX_GAS).await?.into_result()?;
    let s = stats(&env).await?;
    assert_eq!(s["records_created"], 1);
    assert_eq!(s["refusals"], 2);
    assert_eq!(s["volume"][0]["forwarded"], AMOUNT.to_string());
    Ok(())
}
