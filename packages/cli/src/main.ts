#!/usr/bin/env -S npx tsx
/** settled CLI. Commands: pay, get-record, get-stats, list, watch, replay. */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pay, waitForOutcome, watchLoop, watchOnce, type SettledRecord, type SettledStats } from "@settled/sdk";
import { ConfigError, payConfig, viewer, watcherConfig } from "./config.js";
import { alreadyLine, outcomeLine, refusedLine, sentLines } from "./format.js";

const EXIT = { OK: 0, USAGE: 1, ABORTED: 2, UNRESOLVED: 3, REFUSED: 4 } as const;
const out = (l: string) => console.log(l);

const USAGE = `usage:
  settled pay --to <addr> --chain base --asset USDC --amount 2 --key <key> [--force-send] [--no-wait] [--json]
  settled get-record --sender <account> --key <key> [--json]
  settled get-stats [--json]
  settled list --sender <account> [--json]
  settled watch [--once]
  settled replay <fixture.json>`;

async function cmdPay(args: string[]): Promise<number> {
  const { values: v } = parseArgs({
    args,
    options: {
      to: { type: "string" },
      chain: { type: "string", default: "base" },
      asset: { type: "string", default: "USDC" },
      amount: { type: "string" },
      key: { type: "string" },
      "force-send": { type: "boolean", default: false },
      "no-wait": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  if (!v.to || !v.amount || !v.key) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const log = v.json ? () => {} : out;
  const cfg = await payConfig(process.env, v.chain!, v.asset!, log);
  const r = await pay(cfg, { to: v.to, amount: v.amount, key: v.key, forceSend: v["force-send"] });
  const { symbol, decimals } = cfg.origin;
  if (v.json) {
    out(JSON.stringify({ ...r, quote: undefined }));
  }
  switch (r.status) {
    case "ALREADY_RECORDED":
      if (!v.json) out(alreadyLine(v.key, r.record!));
      return EXIT.OK;
    case "REFUSED":
      if (!v.json) out(refusedLine(v.key, r, symbol, decimals));
      return EXIT.REFUSED;
    case "FORWARD_FAILED":
      if (!v.json) out(`FORWARD_FAILED: the transfer to the deposit address failed; the contract returned the tokens in tx ${r.txHash}. The key can be reused.`);
      return EXIT.ABORTED;
    case "ABORTED":
      if (!v.json) out(`ABORTED: ${(r.errors ?? []).join("; ")}`);
      return EXIT.ABORTED;
    case "SENT":
      break;
  }
  if (!v.json) for (const l of sentLines(r, symbol, decimals)) out(l);
  if (v["no-wait"]) return EXIT.OK;
  const w = await waitForOutcome(cfg.chain, { contractId: cfg.contractId, sender: cfg.chain.accountId, key: v.key });
  if (!w.resolved) {
    out(`UNRESOLVED: no terminal outcome by the quote deadline plus margin (last: ${w.record?.outcome ?? "none"})`);
    return EXIT.UNRESOLVED;
  }
  out(outcomeLine(w.record, symbol, decimals, v.chain!.charAt(0).toUpperCase() + v.chain!.slice(1)));
  return EXIT.OK;
}

async function cmdGetRecord(args: string[]): Promise<number> {
  const { values: v } = parseArgs({ args, options: { sender: { type: "string" }, key: { type: "string" }, json: { type: "boolean", default: false } } });
  if (!v.sender || !v.key) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const { viewer: vw, contractId } = viewer();
  const rec = await vw.view<SettledRecord | null>(contractId, "get_record", { sender: v.sender, key: v.key });
  if (v.json) out(JSON.stringify(rec));
  else if (!rec) out(`no record for ${v.sender} / ${v.key} on ${contractId}`);
  else out(`record #${rec.number} ${rec.key}: forward ${rec.forward}, outcome ${rec.outcome}, refused ${rec.refused_count}`);
  return rec ? EXIT.OK : EXIT.ABORTED;
}

async function cmdGetStats(args: string[]): Promise<number> {
  const { values: v } = parseArgs({ args, options: { json: { type: "boolean", default: false } } });
  const { viewer: vw, contractId } = viewer();
  const s = await vw.view<SettledStats>(contractId, "get_stats");
  out(v.json ? JSON.stringify(s) : `records ${s.records_created}, refusals ${s.refusals}, volume ${s.volume.map((x) => `${x.token}=${x.forwarded}`).join(" ")}`);
  return EXIT.OK;
}

async function cmdList(args: string[]): Promise<number> {
  const { values: v } = parseArgs({ args, options: { sender: { type: "string" }, json: { type: "boolean", default: false } } });
  if (!v.sender) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const { viewer: vw, contractId } = viewer();
  const rows = await vw.view<SettledRecord[]>(contractId, "list_records", { sender: v.sender, from: 0, limit: 50 });
  if (v.json) out(JSON.stringify(rows));
  else for (const r of rows) out(`#${r.number} ${r.key} ${r.forward} ${r.outcome} refused=${r.refused_count}`);
  return EXIT.OK;
}

async function cmdWatch(args: string[]): Promise<number> {
  const { values: v } = parseArgs({ args, options: { once: { type: "boolean", default: false } } });
  const cfg = await watcherConfig(process.env, out);
  if (v.once) {
    await watchOnce(cfg);
    return EXIT.OK;
  }
  const ctrl = new AbortController();
  process.on("SIGINT", () => ctrl.abort());
  await watchLoop(cfg, { signal: ctrl.signal });
  return EXIT.OK;
}

function cmdReplay(args: string[]): number {
  const path = args[0];
  if (!path) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const f = JSON.parse(readFileSync(path, "utf8")) as { source: string; recorded_at: string; cli_lines?: string[] };
  out(`REPLAY source: ${f.source}; recorded_at: ${f.recorded_at}`);
  for (const l of f.cli_lines ?? []) out(`REPLAY ${l}`);
  return EXIT.OK;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "pay":
        return await cmdPay(rest);
      case "get-record":
        return await cmdGetRecord(rest);
      case "get-stats":
        return await cmdGetStats(rest);
      case "list":
        return await cmdList(rest);
      case "watch":
        return await cmdWatch(rest);
      case "replay":
        return cmdReplay(rest);
      default:
        out(USAGE);
        return EXIT.USAGE;
    }
  } catch (e) {
    console.error(e instanceof ConfigError ? `config: ${e.message}` : `error: ${(e as Error).message}`);
    return EXIT.ABORTED;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("main.ts")) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
