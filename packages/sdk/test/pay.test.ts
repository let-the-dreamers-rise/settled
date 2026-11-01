import { describe, expect, it } from "vitest";
import { pay, type PayConfig } from "../src/pay.js";
import { MemoryQuoteStore } from "../src/quote.js";
import type { CallResult, ChainClient } from "../src/chain.js";
import type { OneClickClient, QuoteRequest, QuoteResponse } from "../src/oneclick.js";
import type { SettledRecord } from "../src/types.js";

const origin = { tokenContract: "usdc.near", originAsset: "nep141:usdc.near", decimals: 6, symbol: "USDC" };

function record(over: Partial<SettledRecord> = {}): SettledRecord {
  return {
    number: 1,
    sender: "payer.near",
    key: "invoice-4417",
    token: "usdc.near",
    amount: "2000000",
    quote_hash: "h",
    deposit_address: "deposit.near",
    deadline_ms: Date.now() + 600_000,
    forward: "FORWARDED",
    outcome: "SETTLED",
    refused_count: 0,
    created_at_ms: Date.now(),
    resolved_at_ms: null,
    evidence: null,
    ...over,
  };
}

function fakes(existing: SettledRecord | null, callResult?: Partial<CallResult>) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const quotes: QuoteRequest[] = [];
  let current = existing;
  const chain: ChainClient = {
    accountId: "payer.near",
    async view<T>() {
      return current as T;
    },
    async call(_c, method, args) {
      calls.push({ method, args });
      current = current ?? record({ outcome: "PENDING" });
      return { txHash: "TX", logs: ["settled:record number=1 sender=payer.near key=invoice-4417", "settled:forwarded record=1"], value: "2000000", failed: false, ...callResult };
    },
  };
  const oneclick = {
    async quote(req: QuoteRequest): Promise<QuoteResponse> {
      quotes.push(req);
      return {
        timestamp: "t",
        signature: "sig",
        quoteRequest: req,
        quote: { depositAddress: "deposit.near", amountIn: req.amount, amountOut: req.amount, deadline: req.deadline },
      };
    },
  } as unknown as OneClickClient;
  const cfg: PayConfig = {
    chain,
    contractId: "settled.near",
    oneclick,
    origin,
    destinationAsset: "nep141:base-usdc",
    store: new MemoryQuoteStore(),
  };
  return { cfg, calls, quotes };
}

describe("pay", () => {
  it("sends nothing when the key already has a record", async () => {
    const { cfg, calls, quotes } = fakes(record());
    const r = await pay(cfg, { to: "0xR", amount: "2", key: "invoice-4417" });
    expect(r.status).toBe("ALREADY_RECORDED");
    expect(r.sent).toBe(false);
    expect(calls).toHaveLength(0);
    expect(quotes).toHaveLength(0);
  });

  it("quotes, preflights and calls ft_transfer_call for a new key", async () => {
    const { cfg, calls, quotes } = fakes(null);
    const r = await pay(cfg, { to: "0xR", amount: "2", key: "invoice-4417" });
    expect(r.status).toBe("SENT");
    expect(quotes[0]!.refundTo).toBe("payer.near");
    expect(calls[0]!.method).toBe("ft_transfer_call");
    const msg = JSON.parse(calls[0]!.args.msg as string);
    expect(msg.key).toBe("invoice-4417");
    expect(msg.deposit_address).toBe("deposit.near");
    expect(msg.quote_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("force-send reuses the stored quote and reports the contract's refusal", async () => {
    const { cfg, quotes } = fakes(null);
    await pay(cfg, { to: "0xR", amount: "2", key: "invoice-4417" });
    cfg.chain.call = async () => ({
      txHash: "TX2",
      logs: ["settled:refused reason=DUPLICATE_KEY record=1"],
      value: "0",
      failed: false,
    });
    const r = await pay(cfg, { to: "0xR", amount: "2", key: "invoice-4417", forceSend: true });
    expect(quotes).toHaveLength(1);
    expect(r.status).toBe("REFUSED");
    expect(r.reason).toBe("DUPLICATE_KEY");
    expect(r.txHash).toBe("TX2");
  });

  it("force-send without a stored quote aborts instead of quoting", async () => {
    const { cfg, quotes } = fakes(null);
    const r = await pay(cfg, { to: "0xR", amount: "2", key: "k", forceSend: true });
    expect(r.status).toBe("ABORTED");
    expect(quotes).toHaveLength(0);
  });

  it("rejects an invalid key before any network call", async () => {
    const { cfg, calls, quotes } = fakes(null);
    const r = await pay(cfg, { to: "0xR", amount: "2", key: "bad key" });
    expect(r.status).toBe("ABORTED");
    expect(calls.length + quotes.length).toBe(0);
  });
});
