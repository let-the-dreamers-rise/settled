import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { OneClickClient, mapStatus } from "@settled/sdk";
import { startMock, type MockHandle } from "../src/server.js";

// A tiny fake RPC that answers ft_balance_of with a settable balance.
let balance = "0";
const rpc = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const bytes = [...Buffer.from(JSON.stringify(balance))];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { result: bytes } }));
  });
});
let mock: MockHandle;
let client: OneClickClient;

beforeAll(async () => {
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  const a = rpc.address();
  const port = typeof a === "object" && a ? a.port : 0;
  mock = await startMock({ rpcUrl: `http://127.0.0.1:${port}`, tokenContract: "usdc.test", depositAddresses: ["dep1.test"] });
  client = new OneClickClient({ base: mock.url });
});

afterAll(async () => {
  await mock.close();
  rpc.close();
});

const req = {
  dry: false,
  swapType: "EXACT_INPUT" as const,
  slippageTolerance: 100,
  originAsset: "nep141:usdc.test",
  depositType: "ORIGIN_CHAIN" as const,
  destinationAsset: "nep141:base-usdc",
  amount: "2000000",
  recipient: "0xR",
  recipientType: "DESTINATION_CHAIN" as const,
  refundTo: "payer.test",
  refundType: "ORIGIN_CHAIN" as const,
  deadline: new Date(Date.now() + 600_000).toISOString(),
};

describe("mock-1click", () => {
  it("labels every response as mock", async () => {
    const q = await client.quote(req);
    expect(q.mock).toBe(true);
    expect(q.quote.depositAddress).toBe("dep1.test");
    expect(q.signature).toMatch(/^MOCK-/);
  });

  it("reports PENDING_DEPOSIT until the deposit address is funded, then SUCCESS", async () => {
    balance = "0";
    expect(mapStatus(await client.status("dep1.test")).outcome).toBe("PENDING");
    balance = "2000000";
    const s = await client.status("dep1.test");
    expect(s.status).toBe("SUCCESS");
    expect(mapStatus(s).outcome).toBe("SETTLED");
  });

  it("rejects a quote with missing fields", async () => {
    await expect(client.quote({ ...req, recipient: "" })).rejects.toThrow(/HTTP 400/);
  });

  it("lets a test force a status (the near/intents#360 shape)", async () => {
    await fetch(`${mock.url}/__mock/status`, {
      method: "POST",
      body: JSON.stringify({ depositAddress: "dep1.test", response: { status: "FAILED", swapDetails: { refundedAmount: "0", intentHashes: [] } } }),
    });
    expect(mapStatus(await client.status("dep1.test")).outcome).toBe("FAILED_NO_REFUND");
  });
});
