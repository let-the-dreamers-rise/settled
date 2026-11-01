/** Starts a local NEAR sandbox, deploys mock-ft and settled, creates payer, watcher and
 * deposit accounts, and starts mock-1click. Funds-free: nothing here touches mainnet. */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import nw from "near-workspaces";
import type { NearAccount, Worker } from "near-workspaces";
import { startMock, type MockHandle } from "@settled/mock-1click";
import { nearClient, OneClickClient, type ChainClient } from "@settled/sdk";

export interface SandboxEnv {
  worker: Worker;
  rpcUrl: string;
  settled: NearAccount;
  usdc: NearAccount;
  payer: NearAccount;
  watcher: NearAccount;
  deposits: NearAccount[];
  mock: MockHandle;
  oneclick: OneClickClient;
  payerClient: ChainClient;
  watcherClient: ChainClient;
  close(): Promise<void>;
}

/** Whole NEAR to yoctoNEAR. */
const near = (n: number | string): bigint => {
  const [w, f = ""] = String(n).split(".");
  return BigInt(w! + f.padEnd(24, "0"));
};

const repo = resolve(import.meta.dirname, "../../..");
const wasmDir = process.env.SETTLED_WASM_DIR ?? resolve(repo, "target/wasm32-unknown-unknown/release");

function wasm(name: string): string {
  const p = resolve(wasmDir, `${name}.wasm`);
  if (!existsSync(p)) throw new Error(`${p} missing; run scripts/build-contracts.sh`);
  return p;
}

async function client(worker: Worker, rpcUrl: string, a: NearAccount): Promise<ChainClient> {
  const key = await a.getKey();
  if (!key) throw new Error(`no key for ${a.accountId}`);
  return nearClient({ networkId: "sandbox", nodeUrl: rpcUrl, accountId: a.accountId, privateKey: key.toString() });
}

export async function startSandbox(log: (l: string) => void): Promise<SandboxEnv> {
  const worker = await nw.Worker.init();
  const rpcUrl = worker.provider.connection.url;
  const root = worker.rootAccount;
  const usdc = await root.createSubAccount("usdc", { initialBalance: near(10) });
  await usdc.deploy(wasm("mock_ft"));
  await usdc.call(usdc, "new", { symbol: "USDC", decimals: 6 });
  const payer = await root.createSubAccount("payer", { initialBalance: near(20) });
  const watcher = await root.createSubAccount("watcher", { initialBalance: near(5) });
  const settled = await root.createSubAccount("settled", { initialBalance: near(20) });
  await settled.deploy(wasm("settled"));
  await settled.call(settled, "new", { owner: settled.accountId, watcher: watcher.accountId, allowed_tokens: [usdc.accountId] });
  const deposits: NearAccount[] = [];
  for (const name of ["deposit-a", "deposit-b", "deposit-c"]) {
    deposits.push(await root.createSubAccount(name, { initialBalance: near(2) }));
  }
  for (const id of [settled.accountId, ...deposits.map((d) => d.accountId)]) {
    await usdc.call(usdc, "storage_deposit", { account_id: id, registration_only: true }, { attachedDeposit: near("0.01") });
  }
  await usdc.call(usdc, "mint", { account_id: payer.accountId, amount: "20000000" });
  const mock = await startMock({ rpcUrl, tokenContract: usdc.accountId, depositAddresses: deposits.map((d) => d.accountId), log });
  const env: SandboxEnv = {
    worker,
    rpcUrl,
    settled,
    usdc,
    payer,
    watcher,
    deposits,
    mock,
    oneclick: new OneClickClient({ base: mock.url }),
    payerClient: await client(worker, rpcUrl, payer),
    watcherClient: await client(worker, rpcUrl, watcher),
    async close() {
      await mock.close();
      await worker.tearDown();
    },
  };
  log(`sandbox up at ${rpcUrl}; settled=${settled.accountId} token=${usdc.accountId}`);
  return env;
}
