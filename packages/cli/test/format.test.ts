import { describe, expect, it } from "vitest";
import type { PayResult, SettledRecord } from "@settled/sdk";
import { alreadyLine, outcomeLine, refusedLine } from "../src/format.js";

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
  evidence: '{"status":"SUCCESS","destinationTx":["0xabc"]}',
};

describe("CLI lines", () => {
  it("prints the refusal line from the demo script", () => {
    const r: PayResult = { status: "REFUSED", sent: false, record: rec, reason: "DUPLICATE_KEY", txHash: "TXR", refundedAmount: "2000000" };
    expect(refusedLine("invoice-4417", r, "USDC", 6)).toBe(
      "REFUSED: key invoice-4417 is record #1 (SETTLED), reason DUPLICATE_KEY. Contract returned 2 USDC in tx TXR; nothing sent to 1Click.",
    );
  });
  it("prints the settled line with the destination tx", () => {
    expect(outcomeLine(rec, "USDC", 6, "Base")).toBe("SETTLED: 2 USDC on Base, tx 0xabc");
  });
  it("says when the destination tx was not reported", () => {
    expect(outcomeLine({ ...rec, evidence: '{"status":"SUCCESS"}' }, "USDC", 6, "Base")).toMatch(/not reported/);
  });
  it("prints the already-recorded line", () => {
    expect(alreadyLine("invoice-4417", rec)).toBe("ALREADY RECORDED: key invoice-4417 is record #1 (SETTLED); nothing sent.");
  });
  it("never claims recovery for FAILED_NO_REFUND", () => {
    expect(outcomeLine({ ...rec, outcome: "FAILED_NO_REFUND" }, "USDC", 6, "Base")).toMatch(/cannot recover/);
  });
});
