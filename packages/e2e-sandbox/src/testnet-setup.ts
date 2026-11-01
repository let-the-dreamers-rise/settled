/** `pnpm testnet:setup`: creates the demo accounts on NEAR testnet (one faucet-funded root,
 * sub-accounts for each role), deploys mock-ft and settled, registers storage and mints test
 * USDC to the payer. Idempotent: re-running skips what already exists. Writes the public
 * account ids to deploy/testnet.json; keys stay in the credentials file. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { connect, KeyPair, keyStores, type Account } from "near-api-js";
import { CREDENTIALS, ROLES, TESTNET_RPC, account, loadCredentials, saveCredentials, type Credentials, type Role } from "./testnet-accounts.js";

const FAUCETS = ["https://helper.testnet.near.org/account", "https://helper.nearprotocol.com/account"];
const repo = resolve(import.meta.dirname, "../../..");
const wasmDir = process.env.SETTLED_WASM_DIR ?? resolve(repo, "target/wasm32-unknown-unknown/release");
const TGAS = 10n ** 12n;
const near = (n: string) => {
  const [w, f = ""] = n.split(".");
  return BigInt(w! + f.padEnd(24, "0"));
};
/** Initial balance per role, in NEAR. Contract storage is about 1 NEAR per 100 kB of wasm. */
const FUNDING: Record<Role, string> = {
  settled: "3", usdc: "2.2", payer: "0.8", watcher: "0.5", "deposit-a": "0.1", "deposit-b": "0.1", "deposit-c": "0.1",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (l: string) => console.log(`testnet: ${l}`);

async function nearFor(c: Credentials) {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey("testnet", c.root.accountId, KeyPair.fromString(c.root.privateKey as never));
  for (const a of Object.values(c.accounts)) if (a) await keyStore.setKey("testnet", a.accountId, KeyPair.fromString(a.privateKey as never));
  return connect({ networkId: "testnet", nodeUrl: TESTNET_RPC, keyStore, logger: false } as never);
}

async function exists(acct: Account): Promise<boolean> {
  try {
    await acct.state();
    return true;
  } catch {
    return false;
  }
}

async function createRoot(): Promise<Credentials> {
  const accountId = `settled-demo-${randomBytes(4).toString("hex")}.testnet`;
  const kp = KeyPair.fromRandom("ed25519");
  for (const url of FAUCETS) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
    }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }) as Response);
    if (res.ok) {
      log(`faucet ${url} created ${accountId}`);
      return { network: "testnet", root: { accountId, privateKey: kp.toString() }, accounts: {} };
    }
    log(`faucet ${url} refused: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("no testnet faucet accepted the request");
}

async function call(from: Account, contractId: string, methodName: string, args: object, deposit = 0n): Promise<void> {
  await from.functionCall({ contractId, methodName, args, gas: 100n * TGAS, attachedDeposit: deposit });
}

let creds = loadCredentials() ?? (await createRoot());
saveCredentials(creds);
log(`credentials file: ${CREDENTIALS} (keys not printed)`);
let conn = await nearFor(creds);
const root = await conn.account(creds.root.accountId);
for (let i = 0; i < 20 && !(await exists(root)); i++) await sleep(1_500);
if (!(await exists(root))) throw new Error(`${creds.root.accountId} does not exist on testnet yet`);
log(`root ${creds.root.accountId} balance ${(await root.getAccountBalance()).available} yocto`);

for (const role of ROLES) {
  const id = creds.accounts[role]?.accountId ?? `${role}.${creds.root.accountId}`;
  if (creds.accounts[role] && (await exists(await conn.account(id)))) continue;
  const kp = KeyPair.fromRandom("ed25519");
  await root.createAccount(id, kp.getPublicKey(), near(FUNDING[role]));
  creds = { ...creds, accounts: { ...creds.accounts, [role]: { accountId: id, privateKey: kp.toString() } } };
  saveCredentials(creds);
  log(`created ${id} with ${FUNDING[role]} NEAR`);
}
conn = await nearFor(creds);

const usdc = await conn.account(account(creds, "usdc").accountId);
const settled = await conn.account(account(creds, "settled").accountId);
const code = async (a: Account) => (await a.state()).code_hash !== "11111111111111111111111111111111";

if (!(await code(usdc))) {
  await usdc.deployContract(readFileSync(resolve(wasmDir, "mock_ft.wasm")));
  log(`deployed mock_ft to ${usdc.accountId}`);
}
const tokenReady = await usdc.viewFunction({ contractId: usdc.accountId, methodName: "ft_metadata", args: {} }).then(() => true, () => false);
if (!tokenReady) await call(usdc, usdc.accountId, "new", { symbol: "USDC", decimals: 6 });
const initialised = async () =>
  settled.viewFunction({ contractId: settled.accountId, methodName: "get_watcher", args: {} }).then(() => true, () => false);
if (!(await code(settled))) {
  await settled.deployContract(readFileSync(resolve(wasmDir, "settled.wasm")));
  log(`deployed settled to ${settled.accountId}`);
}
if (!(await initialised())) {
  await call(settled, settled.accountId, "new", {
    owner: settled.accountId,
    watcher: account(creds, "watcher").accountId,
    allowed_tokens: [usdc.accountId],
  });
  log(`initialised settled (watcher ${account(creds, "watcher").accountId})`);
}

const deposits = (["deposit-a", "deposit-b", "deposit-c"] as const).map((r) => account(creds, r).accountId);
for (const id of [settled.accountId, account(creds, "payer").accountId, ...deposits]) {
  const reg = await usdc.viewFunction({ contractId: usdc.accountId, methodName: "storage_balance_of", args: { account_id: id } });
  if (!reg) await call(usdc, usdc.accountId, "storage_deposit", { account_id: id, registration_only: true }, near("0.01"));
}
const payerId = account(creds, "payer").accountId;
const bal = BigInt(await usdc.viewFunction({ contractId: usdc.accountId, methodName: "ft_balance_of", args: { account_id: payerId } }));
if (bal < 10_000_000n) await call(usdc, usdc.accountId, "mint", { account_id: payerId, amount: "20000000" });

const pub = {
  network: "testnet",
  rpc: TESTNET_RPC,
  explorer: "https://testnet.nearblocks.io",
  note: "Testnet demo accounts. The token is mock-ft (test USDC, open mint, no value). 1Click is MOCK.",
  root: creds.root.accountId,
  accounts: Object.fromEntries(ROLES.map((r) => [r, account(creds, r).accountId])),
};
mkdirSync(resolve(repo, "deploy"), { recursive: true });
writeFileSync(resolve(repo, "deploy/testnet.json"), JSON.stringify(pub, null, 2) + "\n");
log(`ready: settled=${settled.accountId} token=${usdc.accountId} payer=${payerId}`);
console.log("TESTNET_SETUP_DONE");
