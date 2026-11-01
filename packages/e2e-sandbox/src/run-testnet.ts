/** `pnpm e2e:testnet`: the golden path on NEAR testnet with MOCK 1Click running locally
 * (1Click has no testnet). Real testnet transactions, free test NEAR, mock-ft test USDC.
 * Writes fixtures/run-testnet-001.json. A contract refuses a key once used, so a second run
 * needs a new key: SETTLED_DEMO_KEY=invoice-4418 pnpm e2e:testnet. */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startMock } from "@settled/mock-1click";
import { nearClient, OneClickClient } from "@settled/sdk";
import { runGolden } from "./golden.js";
import { TESTNET_EXPLORER, TESTNET_RPC, account, loadCredentials } from "./testnet-accounts.js";

const creds = loadCredentials();
if (!creds) {
  console.error("no testnet credentials; run pnpm testnet:setup first");
  process.exit(2);
}
const id = (r: Parameters<typeof account>[1]) => account(creds, r).accountId;
const client = (r: "payer" | "watcher") =>
  nearClient({ networkId: "testnet", nodeUrl: TESTNET_RPC, accountId: id(r), privateKey: account(creds, r).privateKey });

const mock = await startMock({
  rpcUrl: TESTNET_RPC,
  tokenContract: id("usdc"),
  depositAddresses: [id("deposit-a"), id("deposit-b"), id("deposit-c")],
  log: (l) => console.log(l),
});
let code = 0;
try {
  const fixture = await runGolden(
    {
      network: "testnet",
      explorer: TESTNET_EXPLORER,
      source: "NEAR testnet with mock-1click",
      label: "demo data: NEAR testnet transactions, test USDC (mock-ft), MOCK 1Click",
      settledId: id("settled"),
      tokenId: id("usdc"),
      payerId: id("payer"),
      payerClient: await client("payer"),
      watcherClient: await client("watcher"),
      oneclick: new OneClickClient({ base: mock.url }),
      quoteCount: () => mock.quotes().length,
    },
    { key: process.env.SETTLED_DEMO_KEY || "invoice-4417", to: "0x1111111111111111111111111111111111111111", say: (l) => console.log(l) },
  );
  const out = process.env.SETTLED_FIXTURE_OUT ?? resolve(import.meta.dirname, "../../../fixtures/run-testnet-001.json");
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(fixture, null, 2));
  console.log(`fixture written: ${out}`);
  console.log("E2E_TESTNET_PASS");
} catch (e) {
  console.error((e as Error).message);
  code = 1;
} finally {
  await mock.close();
}
process.exit(code);
