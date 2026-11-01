/** Golden path Part A steps 1-6 and 8, shared by the local sandbox run and the NEAR testnet
 * run. 1Click is MOCK in both (it has no testnet). Returns the fixture the web console replays;
 * throws on any failed assertion. */

import {
  MemoryQuoteStore,
  pay,
  waitForOutcome,
  watchOnce,
  type ChainClient,
  type OneClickClient,
  type PayConfig,
  type SettledRecord,
  type SettledStats,
} from "@settled/sdk";
import { alreadyLine, outcomeLine, refusedLine, sentLines } from "@settled/cli";
import { settledPay } from "@settled/mcp";

export interface GoldenEnv {
  network: string;
  explorer: string | null;
  source: string;
  label: string;
  settledId: string;
  tokenId: string;
  payerId: string;
  payerClient: ChainClient;
  watcherClient: ChainClient;
  oneclick: OneClickClient;
  /** Number of non-dry quotes the MOCK 1Click has handed out. */
  quoteCount(): number;
}

export interface GoldenOptions {
  key: string;
  to: string;
  onlyPay?: boolean;
  say(line: string): void;
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The watcher runs until it writes SETTLED; on a public chain the deposit balance it checks
 * can lag the forward by a block or two. */
async function resolveSettled(env: GoldenEnv, say: (l: string) => void, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const actions = await watchOnce({ chain: env.watcherClient, contractId: env.settledId, oneclick: env.oneclick, senders: [env.payerId], log: say });
    if (actions.some((a) => a.written && a.to === "SETTLED")) return;
    await sleep(2_000);
  }
  throw new Error("ASSERTION FAILED: watcher resolved SETTLED within the timeout");
}

export async function runGolden(env: GoldenEnv, o: GoldenOptions): Promise<Record<string, unknown> | null> {
  const lines: string[] = [];
  const say = (l: string) => {
    lines.push(l);
    o.say(l);
  };
  const steps: { id: string; label: string; tx_hash?: string; at: string }[] = [];
  const step = (id: string, label: string, tx_hash?: string) => steps.push({ id, label, tx_hash, at: new Date().toISOString() });
  const balance = () => env.payerClient.view<string>(env.tokenId, "ft_balance_of", { account_id: env.payerId });
  const cfg: PayConfig = {
    chain: env.payerClient,
    contractId: env.settledId,
    oneclick: env.oneclick,
    origin: { tokenContract: env.tokenId, originAsset: `nep141:${env.tokenId}`, decimals: 6, symbol: "USDC" },
    destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    store: new MemoryQuoteStore(),
    log: say,
  };

  // Steps 1-4: pay a new key.
  const first = await pay(cfg, { to: o.to, amount: "2", key: o.key });
  check(first.status === "SENT", `first payment SENT, got ${first.status} ${first.errors ?? ""}`);
  for (const l of sentLines(first, "USDC", 6)) say(l);
  step("record", `record #${first.recordNumber} written on NEAR`, first.txHash);
  step("forwarded", `contract forwarded 2 USDC to deposit address ${first.depositAddress}`, first.txHash);

  // Step 5: watcher maps MOCK status and resolves; the payer side waits on the record.
  await resolveSettled(env, say);
  step("1click", "MOCK 1Click reports SUCCESS");
  const waited = await waitForOutcome(env.payerClient, { contractId: env.settledId, sender: env.payerId, key: o.key, pollMs: 1_000 });
  check(waited.resolved && waited.record.outcome === "SETTLED", "record SETTLED");
  say(outcomeLine(waited.record, "USDC", 6, "Base"));
  step("settled", outcomeLine(waited.record, "USDC", 6, "Base"));
  const byKey = await env.payerClient.view<SettledRecord>(env.settledId, "get_by_key", { sender: env.payerId, key: o.key });
  check(byKey.outcome === "SETTLED", "get_by_key returns SETTLED");
  if (o.onlyPay) return null;

  // Client-side check: same key, nothing sent.
  const again = await pay(cfg, { to: o.to, amount: "2", key: o.key });
  check(again.status === "ALREADY_RECORDED", "client-side check stops a plain retry");
  say(alreadyLine(o.key, again.record!));

  // Step 6: --force-send reuses the stored quote; the contract refuses and refunds.
  const before = await balance();
  const forced = await pay(cfg, { to: o.to, amount: "2", key: o.key, forceSend: true });
  check(forced.status === "REFUSED" && forced.reason === "DUPLICATE_KEY", `force-send REFUSED DUPLICATE_KEY, got ${forced.status} ${forced.reason}`);
  const after = await balance();
  check(before === after, `payer balance unchanged by the refused retry (${before} -> ${after})`);
  check(env.quoteCount() === 1, "force-send made no second quote request");
  say(refusedLine(o.key, forced, "USDC", 6));

  // Step 8: scripted MCP agent call.
  const mcp = await settledPay({ payConfig: async () => cfg }, { to: o.to, chain: "base", asset: "USDC", amount: "2", key: o.key });
  const mcpBody = JSON.parse(mcp.content[0]!.text);
  check(mcpBody.sent === false && mcpBody.status === "ALREADY_RECORDED", "MCP settled_pay ALREADY_RECORDED");
  say(`scripted agent settled_pay -> ${mcp.content[0]!.text}`);

  const record = await env.payerClient.view<SettledRecord>(env.settledId, "get_record", { sender: env.payerId, key: o.key });
  const stats = await env.payerClient.view<SettledStats>(env.settledId, "get_stats");
  check(record.refused_count === 1, "record shows 1 refused retry");
  check(stats.refusals >= 1 && stats.records_created >= 1, "stats count the run");

  return {
    schema: "settled-run/1",
    source: env.source,
    label: env.label,
    recorded_at: new Date().toISOString(),
    network: env.network,
    explorer: env.explorer,
    contract_id: env.settledId,
    payer: env.payerId,
    key: o.key,
    amount: "2",
    symbol: "USDC",
    destination_chain: "Base",
    steps,
    refusal: { reason: forced.reason, tx_hash: forced.txHash, refunded: "2" },
    mcp: { request: { key: o.key }, response: mcpBody },
    record,
    stats,
    cli_lines: lines,
  };
}
