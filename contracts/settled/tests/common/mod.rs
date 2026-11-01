//! Sandbox fixture: deploys `mock-ft` (allowed), a second `mock-ft` (not allowed) and
//! `settled`, and funds two payers. Wasm comes from `scripts/build-contracts.sh`.

use anyhow::Result;
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

pub const AMOUNT: u128 = 2_000_000; // 2 USDC at 6 decimals

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub settled: Contract,
    pub usdc: Contract,
    pub fake: Contract,
    pub alice: Account,
    pub bob: Account,
    pub watcher: Account,
    pub deposit: Account,
}

fn wasm(name: &str) -> Result<Vec<u8>> {
    let dir = std::env::var("SETTLED_WASM_DIR").unwrap_or_else(|_| {
        format!(
            "{}/../../target/wasm32-unknown-unknown/release",
            env!("CARGO_MANIFEST_DIR")
        )
    });
    let path = format!("{dir}/{name}.wasm");
    std::fs::read(&path).map_err(|e| anyhow::anyhow!("{path}: {e}; run scripts/build-contracts.sh"))
}

async fn sub(root: &Account, name: &str, near: u128) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await?
        .into_result()?)
}

async fn deploy_ft(root: &Account, name: &str, ft: &[u8]) -> Result<Contract> {
    let acct = sub(root, name, 10).await?;
    let c = acct.deploy(ft).await?.into_result()?;
    c.call("new")
        .args_json(json!({"symbol": "USDC", "decimals": 6}))
        .transact()
        .await?
        .into_result()?;
    Ok(c)
}

pub async fn register(token: &Contract, account: &str) -> Result<()> {
    token
        .as_account()
        .call(token.id(), "storage_deposit")
        .args_json(json!({"account_id": account, "registration_only": true}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

pub async fn setup() -> Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let ft = wasm("mock_ft")?;
    let usdc = deploy_ft(&root, "usdc", &ft).await?;
    let fake = deploy_ft(&root, "fake", &ft).await?;
    let watcher = sub(&root, "watcher", 5).await?;
    let deposit = sub(&root, "deposit", 5).await?;
    let alice = sub(&root, "alice", 20).await?;
    let bob = sub(&root, "bob", 20).await?;
    let settled_acct = sub(&root, "settled", 20).await?;
    let settled = settled_acct.deploy(&wasm("settled")?).await?.into_result()?;
    settled
        .call("new")
        .args_json(json!({
            "owner": settled.id(),
            "watcher": watcher.id(),
            "allowed_tokens": [usdc.id()],
        }))
        .transact()
        .await?
        .into_result()?;
    for token in [&usdc, &fake] {
        register(token, settled.id().as_str()).await?;
        for payer in [&alice, &bob] {
            token
                .call("mint")
                .args_json(json!({"account_id": payer.id(), "amount": (AMOUNT * 10).to_string()}))
                .transact()
                .await?
                .into_result()?;
        }
    }
    register(&usdc, deposit.id().as_str()).await?;
    Ok(Env { worker, settled, usdc, fake, alice, bob, watcher, deposit })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

pub fn pay_msg(key: &str, deposit: &str, deadline_ms: Option<u64>) -> String {
    json!({
        "key": key,
        "quote_hash": "sha256-test-quote",
        "deposit_address": deposit,
        "deadline_ms": deadline_ms.unwrap_or(now_ms() + 600_000),
    })
    .to_string()
}

pub async fn pay(
    payer: &Account,
    token: &Contract,
    env: &Env,
    msg: String,
    gas: Gas,
) -> Result<ExecutionFinalResult> {
    Ok(payer
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": env.settled.id(),
            "amount": AMOUNT.to_string(),
            "msg": msg,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(gas)
        .transact()
        .await?)
}

pub async fn balance(token: &Contract, account: &str) -> Result<u128> {
    let v: String = token
        .view("ft_balance_of")
        .args_json(json!({"account_id": account}))
        .await?
        .json()?;
    Ok(v.parse()?)
}

pub async fn record(env: &Env, sender: &str, key: &str) -> Result<Value> {
    Ok(env
        .settled
        .view("get_record")
        .args_json(json!({"sender": sender, "key": key}))
        .await?
        .json()?)
}

pub async fn stats(env: &Env) -> Result<Value> {
    Ok(env.settled.view("get_stats").await?.json()?)
}

pub fn all_logs(r: &ExecutionFinalResult) -> Vec<String> {
    r.logs().iter().map(|s| s.to_string()).collect()
}

pub fn has_log(r: &ExecutionFinalResult, needle: &str) -> bool {
    all_logs(r).iter().any(|l| l.contains(needle))
}

/// `ft_transfer_call` returns the amount the receiver used.
pub fn used(r: &ExecutionFinalResult) -> u128 {
    let v: String = r.clone().json().unwrap_or_else(|_| "0".into());
    v.parse().unwrap_or(0)
}

pub const MAX_GAS: Gas = Gas::from_tgas(300);
