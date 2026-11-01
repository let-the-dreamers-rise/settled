/** MCP tools for agents: `settled_pay` and `settled_get_receipt`.
 *
 * `settled_pay` runs the same client-side check as the CLI first: if the key already has a
 * record, it sends nothing and says so. It never uses force-send. The contract-side refusal is
 * the second line of defence, shown by the CLI's `--force-send`. */

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pay, type PayConfig, type SettledRecord, type Viewer } from "@settled/sdk";

export interface ToolDeps {
  /** Builds a pay config for a chain and asset; called only when a payment may be sent. */
  payConfig?: (chain: string, asset: string) => Promise<PayConfig>;
  viewer?: Viewer;
  contractId?: string;
  defaultSender?: string;
  /** Fixture path: `settled_get_receipt` answers from it, labelled REPLAY. */
  replayFixture?: string;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const result = (body: unknown, isError = false): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(body) }],
  ...(isError ? { isError } : {}),
});

export const payInput = {
  to: z.string().min(1).describe("Recipient address on the destination chain"),
  chain: z.string().default("base").describe("Destination chain, e.g. base"),
  asset: z.string().default("USDC").describe("Asset symbol, e.g. USDC"),
  amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Amount in whole units, e.g. 2"),
  key: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/).describe("Idempotency key, e.g. an invoice id. Reuse it on every retry."),
};

export const receiptInput = {
  key: z.string().min(1),
  sender: z.string().optional().describe("Payer account; defaults to the configured payer"),
};

export async function settledPay(deps: ToolDeps, args: { to: string; chain: string; asset: string; amount: string; key: string }): Promise<ToolResult> {
  if (!deps.payConfig) return result({ sent: false, status: "NOT_CONFIGURED", error: "payer is not configured" }, true);
  const cfg = await deps.payConfig(args.chain, args.asset);
  const r = await pay(cfg, { to: args.to, amount: args.amount, key: args.key });
  const base = { sent: r.sent, status: r.status, record: r.recordNumber ?? r.record?.number ?? null };
  switch (r.status) {
    case "ALREADY_RECORDED":
      return result({ ...base, outcome: r.record?.outcome });
    case "SENT":
      return result({ ...base, txHash: r.txHash, outcome: r.record?.outcome ?? "PENDING" });
    case "REFUSED":
      return result({ ...base, reason: r.reason, txHash: r.txHash });
    default:
      return result({ ...base, errors: r.errors, txHash: r.txHash }, true);
  }
}

export async function settledGetReceipt(deps: ToolDeps, args: { key: string; sender?: string }): Promise<ToolResult> {
  if (deps.replayFixture) {
    const f = JSON.parse(readFileSync(deps.replayFixture, "utf8")) as { source: string; record: SettledRecord };
    if (f.record.key !== args.key) return result({ replay: true, source: f.source, record: null });
    return result({ replay: true, source: f.source, record: f.record });
  }
  const sender = args.sender ?? deps.defaultSender;
  if (!deps.viewer || !deps.contractId || !sender) {
    return result({ error: "viewer, contract id and sender are required" }, true);
  }
  const record = await deps.viewer.view<SettledRecord | null>(deps.contractId, "get_record", { sender, key: args.key });
  return result({ record });
}

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "settled", version: "0.1.0" });
  server.tool(
    "settled_pay",
    "Pay through the Settled contract on NEAR via 1Click. A retry with the same key never pays twice: if the key already has a record, nothing is sent.",
    payInput,
    (args) => settledPay(deps, args),
  );
  server.tool(
    "settled_get_receipt",
    "Read the on-chain Settled record (outcome, deposit address, quote hash) for a payer and key.",
    receiptInput,
    (args) => settledGetReceipt(deps, args),
  );
  return server;
}
