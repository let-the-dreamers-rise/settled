import { describe, expect, it } from "vitest";
import { preflight, type Expected } from "../src/preflight.js";
import type { QuoteResponse } from "../src/oneclick.js";

const now = Date.parse("2026-11-08T10:00:00Z");
const expected: Expected = {
  payer: "payer.near",
  originAsset: "nep141:usdc.near",
  destinationAsset: "nep141:base-usdc.omft.near",
  recipient: "0xRecipient",
  amount: "2000000",
  minValidityMs: 60_000,
  now,
};

function quote(overrides: Partial<QuoteResponse["quoteRequest"]> = {}, q: Partial<QuoteResponse["quote"]> = {}): QuoteResponse {
  return {
    timestamp: "t",
    signature: "sig",
    quoteRequest: {
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: expected.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: expected.destinationAsset,
      amount: "2000000",
      recipient: expected.recipient,
      recipientType: "DESTINATION_CHAIN",
      refundTo: "payer.near",
      refundType: "ORIGIN_CHAIN",
      deadline: "2026-11-08T10:10:00Z",
      ...overrides,
    },
    quote: {
      depositAddress: "deposit.near",
      amountIn: "2000000",
      amountOut: "1990000",
      deadline: "2026-11-08T10:10:00Z",
      ...q,
    },
  };
}

describe("preflight", () => {
  it("passes a matching quote", () => {
    expect(preflight(quote(), expected)).toEqual([]);
  });
  it("rejects refundTo that is not the payer", () => {
    expect(preflight(quote({ refundTo: "someone.near" }), expected).join()).toMatch(/refundTo/);
  });
  it("rejects a different origin asset", () => {
    expect(preflight(quote({ originAsset: "nep141:other" }), expected).join()).toMatch(/origin asset/);
  });
  it("rejects a different destination chain or asset (the wrong-chain case)", () => {
    expect(preflight(quote({ destinationAsset: "nep141:eth-usdc" }), expected).join()).toMatch(/destination asset/);
  });
  it("rejects a different recipient", () => {
    expect(preflight(quote({ recipient: "0xOther" }), expected).join()).toMatch(/recipient/);
  });
  it("rejects a different amount", () => {
    expect(preflight(quote({}, { amountIn: "1999999" }), expected).join()).toMatch(/amountIn/);
  });
  it("rejects a passed or too-close deadline", () => {
    expect(preflight(quote({}, { deadline: "2026-11-08T10:00:30Z" }), expected).join()).toMatch(/deadline/);
  });
  it("skips the deadline check for force-send", () => {
    expect(preflight(quote({}, { deadline: "2026-11-08T09:00:00Z" }), { ...expected, skipDeadline: true })).toEqual([]);
  });
  it("rejects a missing deposit address", () => {
    expect(preflight(quote({}, { depositAddress: undefined }), expected).join()).toMatch(/depositAddress/);
  });
  it("rejects a deposit address that needs a memo", () => {
    expect(preflight(quote({}, { depositMemo: "123" }), expected).join()).toMatch(/memo/);
  });
});
