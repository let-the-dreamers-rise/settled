import { describe, expect, it } from "vitest";
import { evidenceJson, mapError, mapStatus } from "../src/mapper.js";
import type { StatusResponse } from "../src/oneclick.js";

// One row per documented 1Click status (spec section 5). Rows marked synthetic are built from
// the docs' status table, not observed on mainnet.
const rows: { name: string; res: StatusResponse | null; outcome: string; flag?: string }[] = [
  { name: "PENDING_DEPOSIT", res: { status: "PENDING_DEPOSIT" }, outcome: "PENDING" },
  { name: "KNOWN_DEPOSIT_TX", res: { status: "KNOWN_DEPOSIT_TX" }, outcome: "PENDING" },
  { name: "PROCESSING", res: { status: "PROCESSING" }, outcome: "PENDING" },
  {
    name: "SUCCESS",
    res: { status: "SUCCESS", swapDetails: { destinationChainTxHashes: [{ hash: "0xabc" }] } },
    outcome: "SETTLED",
  },
  { name: "INCOMPLETE_DEPOSIT (synthetic)", res: { status: "INCOMPLETE_DEPOSIT" }, outcome: "INCOMPLETE" },
  { name: "REFUNDED", res: { status: "REFUNDED", swapDetails: { refundedAmount: "2000000" } }, outcome: "REFUNDED" },
  { name: "FAILED with refund", res: { status: "FAILED", swapDetails: { refundedAmount: "5" } }, outcome: "REFUNDED" },
  {
    name: "FAILED, refund 0, no intents (near/intents#360 shape)",
    res: { status: "FAILED", swapDetails: { refundedAmount: "0", intentHashes: [] } },
    outcome: "FAILED_NO_REFUND",
  },
  {
    name: "FAILED other shape (synthetic)",
    res: { status: "FAILED", swapDetails: { refundedAmount: "0", intentHashes: ["x"] } },
    outcome: "PENDING",
    flag: "failed_unclassified",
  },
  { name: "FAILED with no details", res: { status: "FAILED" }, outcome: "PENDING", flag: "failed_unclassified" },
  { name: "unknown status", res: { status: "SOMETHING_NEW" }, outcome: "PENDING", flag: "unknown_status" },
  { name: "missing response", res: null, outcome: "PENDING", flag: "missing_status" },
];

describe("mapStatus", () => {
  for (const row of rows) {
    it(row.name, () => {
      const m = mapStatus(row.res);
      expect(m.outcome).toBe(row.outcome);
      if (row.flag) expect(m.flags).toContain(row.flag);
    });
  }

  it("never maps an unknown value to SETTLED", () => {
    for (const s of ["", "success", "SETTLED", "DONE", "OK"]) {
      expect(mapStatus({ status: s }).outcome).not.toBe("SETTLED");
    }
  });

  it("keeps destination tx hashes as evidence", () => {
    const m = mapStatus({ status: "SUCCESS", swapDetails: { destinationChainTxHashes: [{ hash: "0xabc" }] } });
    expect(m.evidence.destinationTx).toEqual(["0xabc"]);
  });
});

describe("mapError", () => {
  it("maps 429 and HTTP errors to PENDING", () => {
    expect(mapError(429).outcome).toBe("PENDING");
    expect(mapError(429).evidence.status).toBe("HTTP_429");
    expect(mapError(500).outcome).toBe("PENDING");
    expect(mapError(null).outcome).toBe("PENDING");
  });
});

describe("evidenceJson", () => {
  it("drops empty fields and stays under 2048 bytes", () => {
    const s = evidenceJson({ status: "SUCCESS", destinationTx: [], refundedAmount: undefined });
    expect(s).toBe('{"status":"SUCCESS"}');
    const big = evidenceJson({ status: "X", destinationTx: Array(500).fill("0x" + "a".repeat(64)) });
    expect(big.length).toBeLessThanOrEqual(2048);
  });
});
