/** MOCK 1Click server for the funds-free sandbox path. 1Click has no testnet, so this stands
 * in for quote and status. Every response carries `"mock": true`, every log line starts with
 * MOCK, and nothing here is presented as a real 1Click response.
 *
 * Status is derived from the sandbox chain: once the deposit address holds at least the
 * quoted amount, the swap reports SUCCESS with a MOCK destination hash. Tests can force any
 * status for a deposit address through POST /__mock/status. */

import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { viewRpc, type QuoteRequest, type QuoteResponse, type StatusResponse } from "@settled/sdk";

export interface MockConfig {
  port?: number;
  rpcUrl: string;
  tokenContract: string;
  /** Sandbox accounts registered on the token, handed out one per quote. */
  depositAddresses: string[];
  log?: (line: string) => void;
}

export interface MockHandle {
  url: string;
  close(): Promise<void>;
  quotes(): QuoteResponse[];
}

const REQUIRED: (keyof QuoteRequest)[] = [
  "swapType",
  "originAsset",
  "destinationAsset",
  "amount",
  "recipient",
  "refundTo",
  "deadline",
];

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function startMock(cfg: MockConfig): Promise<MockHandle> {
  const log = (s: string) => cfg.log?.(`MOCK ${s}`);
  let quotes: Readonly<Record<string, QuoteResponse>> = {};
  let overrides: Readonly<Record<string, StatusResponse>> = {};
  let next = 0;

  async function quote(body: QuoteRequest): Promise<[number, unknown]> {
    const missing = REQUIRED.filter((k) => body[k] === undefined || body[k] === "");
    if (missing.length) return [400, { message: `missing fields: ${missing.join(", ")}`, mock: true }];
    if (body.dry) {
      return [200, { mock: true, timestamp: new Date().toISOString(), signature: "MOCK-dry", quoteRequest: body,
        quote: { amountIn: body.amount, amountOut: body.amount, deadline: body.deadline } }];
    }
    const depositAddress = cfg.depositAddresses[next % cfg.depositAddresses.length];
    if (!depositAddress) return [500, { message: "mock has no deposit addresses", mock: true }];
    next += 1;
    const response: QuoteResponse = {
      correlationId: `MOCK-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      signature: `MOCK-sig-${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32)}`,
      quoteRequest: body,
      quote: {
        depositAddress,
        amountIn: body.amount,
        amountInFormatted: body.amount,
        amountOut: body.amount,
        minAmountIn: body.amount,
        minAmountOut: body.amount,
        deadline: body.deadline,
        timeEstimate: 5,
      },
      mock: true,
    };
    quotes = { ...quotes, [depositAddress]: response };
    log(`quote ${response.correlationId} -> deposit address ${depositAddress}`);
    return [200, response];
  }

  async function status(depositAddress: string): Promise<[number, unknown]> {
    const forced = overrides[depositAddress];
    if (forced) return [200, { ...forced, mock: true }];
    const q = quotes[depositAddress];
    if (!q) return [404, { message: "unknown deposit address", mock: true }];
    const balance = await viewRpc<string>(cfg.rpcUrl, cfg.tokenContract, "ft_balance_of", { account_id: depositAddress });
    const done = BigInt(balance) >= BigInt(q.quote.amountIn);
    const body: StatusResponse = {
      correlationId: q.correlationId,
      status: done ? "SUCCESS" : "PENDING_DEPOSIT",
      updatedAt: new Date().toISOString(),
      swapDetails: done
        ? {
            intentHashes: [`MOCK-intent-${q.correlationId}`],
            nearTxHashes: [],
            amountIn: q.quote.amountIn,
            amountOut: q.quote.amountOut,
            destinationChainTxHashes: [{ hash: `MOCK-dest-${createHash("sha256").update(depositAddress).digest("hex").slice(0, 16)}`, explorerUrl: "" }],
            refundedAmount: "0",
          }
        : { intentHashes: [], nearTxHashes: [] },
      mock: true,
    };
    log(`status ${depositAddress}: ${body.status}`);
    return [200, body];
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "POST" && url.pathname === "/v0/quote") {
        const [code, body] = await quote((await readJson(req)) as QuoteRequest);
        return send(res, code, body);
      }
      if (req.method === "GET" && url.pathname === "/v0/status") {
        const addr = url.searchParams.get("depositAddress");
        if (!addr) return send(res, 400, { message: "depositAddress required", mock: true });
        const [code, body] = await status(addr);
        return send(res, code, body);
      }
      if (req.method === "GET" && url.pathname === "/v0/tokens") {
        return send(res, 200, [{ assetId: `nep141:${cfg.tokenContract}`, symbol: "USDC", decimals: 6, blockchain: "near", mock: true }]);
      }
      if (req.method === "POST" && url.pathname === "/__mock/status") {
        const { depositAddress, response } = (await readJson(req)) as { depositAddress: string; response: StatusResponse };
        overrides = { ...overrides, [depositAddress]: response };
        log(`forced status for ${depositAddress}: ${response.status}`);
        return send(res, 200, { ok: true, mock: true });
      }
      return send(res, 404, { message: "not found", mock: true });
    } catch (e) {
      log(`error: ${(e as Error).message}`);
      return send(res, 500, { message: "mock error", mock: true });
    }
  });

  await new Promise<void>((resolve) => server.listen(cfg.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : cfg.port;
  const url = `http://127.0.0.1:${port}`;
  log(`listening on ${url}`);
  return {
    url,
    quotes: () => Object.values(quotes),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
