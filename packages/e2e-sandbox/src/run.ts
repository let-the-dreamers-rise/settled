/** `pnpm e2e:sandbox`: golden path Part A steps 1-6 and 8 against the local sandbox with
 * MOCK 1Click. Writes fixtures/run-sandbox-001.json for the web console. Exits non-zero on
 * any failed assertion. `--only-pay` stops after pay -> SETTLED (`pnpm test:sandbox-pay`). */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MemoryQuoteStore,
  pay,
  waitForOutcome,
  watchOnce,
  type PayConfig,
  type SettledRecord,
  type SettledStats,
} from "@settled/sdk";
import { alreadyLine, outcomeLine, refusedLine, sentLines } from "@settled/cli";
import { settledPay } from "@settled/mcp";
import { startSandbox } from "./env.js";

const onlyPay = process.argv.includes("--only-pay");
const KEY = "invoice-4417";
const TO = "0x1111111111111111111111111111111111111111";
const lines: string[] = [];
const say = (l: string) => {
  lines.push(l);
  console.log(l);
};

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const env = await startSandbox((l) => console.log(l));
let code = 0;
try {
  const steps: { id: string; label: string; tx_hash?: string; at: string }[] = [];
  const step = (id: string, label: string, tx_hash?: string) => steps.push({ id, label, tx_hash, at: new Date().toISOString() });
  const cfg: PayConfig = {
    chain: env.payerClient,
    contractId: env.settled.accountId,
    oneclick: env.oneclick,
    origin: { tokenContract: env.usdc.accountId, originAsset: `nep141:${env.usdc.accountId}`, decimals: 6, symbol: "USDC" },
    destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    store: new MemoryQuoteStore(),
    log: say,
  };

  // Steps 1-4: pay a new key.
  const first = await pay(cfg, { to: TO, amount: "2", key: KEY });
  check(first.status === "SENT", `first payment SENT, got ${first.status} ${first.errors ?? ""}`);
  for (const l of sentLines(first, "USDC", 6)) say(l);
  step("record", `record #${first.recordNumber} written on NEAR`, first.txHash);
  step("forwarded", `contract forwarded 2 USDC to deposit address ${first.depositAddress}`, first.txHash);

  // Step 5: watcher maps MOCK status and resolves; the payer side waits on the record.
  const actions = await watchOnce({ chain: env.watcherClient, contractId: env.settled.accountId, oneclick: env.oneclick, senders: [env.payer.accountId], log: say });
  check(actions.some((a) => a.written && a.to === "SETTLED"), "watcher resolved SETTLED");
  step("1click", "MOCK 1Click reports SUCCESS");
  const waited = await waitForOutcome(env.payerClient, { contractId: env.settled.accountId, sender: env.payer.accountId, key: KEY, pollMs: 500 });
  check(waited.resolved && waited.record.outcome === "SETTLED", "record SETTLED");
  say(outcomeLine(waited.record, "USDC", 6, "Base"));
  step("settled", outcomeLine(waited.record, "USDC", 6, "Base"));
  const byKey = await env.payerClient.view<SettledRecord>(env.settled.accountId, "get_by_key", { sender: env.payer.accountId, key: KEY });
  check(byKey.outcome === "SETTLED", "get_by_key returns SETTLED");

  if (!onlyPay) {
    // Client-side check: same key, nothing sent.
    const again = await pay(cfg, { to: TO, amount: "2", key: KEY });
    check(again.status === "ALREADY_RECORDED", "client-side check stops a plain retry");
    say(alreadyLine(KEY, again.record!));

    // Step 6: --force-send reuses the stored quote; the contract refuses and refunds.
    const before = await env.usdc.view("ft_balance_of", { account_id: env.payer.accountId });
    const forced = await pay(cfg, { to: TO, amount: "2", key: KEY, forceSend: true });
    check(forced.status === "REFUSED" && forced.reason === "DUPLICATE_KEY", `force-send REFUSED DUPLICATE_KEY, got ${forced.status} ${forced.reason}`);
    const after = await env.usdc.view("ft_balance_of", { account_id: env.payer.accountId });
    check(before === after, `payer balance unchanged by the refused retry (${before} -> ${after})`);
    check(env.mock.quotes().length === 1, "force-send made no second quote request");
    say(refusedLine(KEY, forced, "USDC", 6));

    // Step 8: scripted MCP agent call.
    const mcp = await settledPay({ payConfig: async () => cfg }, { to: TO, chain: "base", asset: "USDC", amount: "2", key: KEY });
    const mcpBody = JSON.parse(mcp.content[0]!.text);
    check(mcpBody.sent === false && mcpBody.status === "ALREADY_RECORDED", "MCP settled_pay ALREADY_RECORDED");
    say(`scripted agent settled_pay -> ${mcp.content[0]!.text}`);

    const record = await env.payerClient.view<SettledRecord>(env.settled.accountId, "get_record", { sender: env.payer.accountId, key: KEY });
    const stats = await env.payerClient.view<SettledStats>(env.settled.accountId, "get_stats");
    check(record.refused_count === 1 && stats.refusals === 1 && stats.records_created === 1, "stats: 1 tracked, 1 refusal");

    const fixture = {
      schema: "settled-run/1",
      source: "sandbox with mock-1click",
      label: "demo data: sandbox with MOCK 1Click",
      recorded_at: new Date().toISOString(),
      network: "sandbox",
      explorer: null,
      contract_id: env.settled.accountId,
      payer: env.payer.accountId,
      key: KEY,
      amount: "2",
      symbol: "USDC",
      destination_chain: "Base",
      steps,
      refusal: { reason: forced.reason, tx_hash: forced.txHash, refunded: "2" },
      mcp: { request: { key: KEY }, response: mcpBody },
      record,
      stats,
      cli_lines: lines,
    };
    const out = process.env.SETTLED_FIXTURE_OUT ?? resolve(import.meta.dirname, "../../../fixtures/run-sandbox-001.json");
    mkdirSync(resolve(out, ".."), { recursive: true });
    writeFileSync(out, JSON.stringify(fixture, null, 2));
    console.log(`fixture written: ${out}`);
  }
  console.log("E2E_SANDBOX_PASS");
} catch (e) {
  console.error((e as Error).message);
  code = 1;
} finally {
  await env.close();
}
process.exit(code);
