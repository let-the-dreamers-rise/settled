import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MemoryQuoteStore, type ChainClient, type OneClickClient, type PayConfig, type SettledRecord } from "@settled/sdk";
import { buildServer, type ToolDeps } from "../src/tools.js";

const rec: SettledRecord = {
  number: 1,
  sender: "payer.near",
  key: "invoice-4417",
  token: "usdc.near",
  amount: "2000000",
  quote_hash: "h",
  deposit_address: "dep.near",
  deadline_ms: 0,
  forward: "FORWARDED",
  outcome: "SETTLED",
  refused_count: 1,
  created_at_ms: 0,
  resolved_at_ms: 1,
  evidence: null,
};

function deps(existing: SettledRecord | null, sent: { calls: number }): ToolDeps {
  const chain: ChainClient = {
    accountId: "payer.near",
    async view<T>() {
      return existing as T;
    },
    async call() {
      sent.calls += 1;
      return { txHash: "TX", logs: [], value: "0", failed: false };
    },
  };
  const cfg: PayConfig = {
    chain,
    contractId: "settled.near",
    oneclick: { quote: async () => { throw new Error("must not quote"); } } as unknown as OneClickClient,
    origin: { tokenContract: "usdc.near", originAsset: "nep141:usdc.near", decimals: 6, symbol: "USDC" },
    destinationAsset: "nep141:base-usdc",
    store: new MemoryQuoteStore(),
  };
  return { payConfig: async () => cfg, viewer: chain, contractId: "settled.near", defaultSender: "payer.near" };
}

async function connect(d: ToolDeps) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer(d);
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

const text = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content[0]!).text);

describe("MCP server", () => {
  it("lists both tools", async () => {
    const client = await connect(deps(null, { calls: 0 }));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["settled_get_receipt", "settled_pay"]);
  });

  it("settled_pay on an existing key sends nothing and reports ALREADY_RECORDED", async () => {
    const sent = { calls: 0 };
    const client = await connect(deps(rec, sent));
    const r = await client.callTool({ name: "settled_pay", arguments: { to: "0xR", chain: "base", asset: "USDC", amount: "2", key: "invoice-4417" } });
    expect(text(r)).toEqual({ sent: false, status: "ALREADY_RECORDED", record: 1, outcome: "SETTLED" });
    expect(sent.calls).toBe(0);
  });

  it("settled_get_receipt reads the record", async () => {
    const client = await connect(deps(rec, { calls: 0 }));
    const r = await client.callTool({ name: "settled_get_receipt", arguments: { key: "invoice-4417" } });
    expect(text(r).record.outcome).toBe("SETTLED");
  });

  it("settled_get_receipt in replay mode answers from the fixture, labelled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "settled-"));
    const path = join(dir, "run.json");
    writeFileSync(path, JSON.stringify({ source: "sandbox with mock-1click", record: rec }));
    const client = await connect({ replayFixture: path });
    const body = text(await client.callTool({ name: "settled_get_receipt", arguments: { key: "invoice-4417" } }));
    expect(body.replay).toBe(true);
    expect(body.record.number).toBe(1);
  });
});
