import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits } from "../src/assets.js";
import { parseSettledLogs } from "../src/chain.js";
import { decodeOutcome } from "../src/near.js";
import { isValidKey } from "../src/types.js";

describe("amounts", () => {
  it("converts exactly", () => {
    expect(toBaseUnits("2", 6)).toBe("2000000");
    expect(toBaseUnits("0.5", 6)).toBe("500000");
    expect(toBaseUnits("1.000001", 6)).toBe("1000001");
    expect(fromBaseUnits("2000000", 6)).toBe("2");
    expect(fromBaseUnits("500000", 6)).toBe("0.5");
  });
  it("rejects bad input", () => {
    expect(() => toBaseUnits("1.0000001", 6)).toThrow();
    expect(() => toBaseUnits("-1", 6)).toThrow();
    expect(() => toBaseUnits("0", 6)).toThrow();
    expect(() => toBaseUnits("1e3", 6)).toThrow();
  });
});

describe("keys", () => {
  it("matches the contract's rule", () => {
    expect(isValidKey("invoice-4417")).toBe(true);
    expect(isValidKey("has space")).toBe(false);
    expect(isValidKey("a|b")).toBe(false);
    expect(isValidKey("x".repeat(65))).toBe(false);
  });
});

describe("parseSettledLogs", () => {
  it("reads refusal, record and forward lines", () => {
    expect(parseSettledLogs(["settled:refused reason=DUPLICATE_KEY record=17"]).refused).toEqual({
      reason: "DUPLICATE_KEY",
      record: 17,
    });
    expect(parseSettledLogs(["settled:refused reason=MALFORMED_MSG"]).refused).toEqual({
      reason: "MALFORMED_MSG",
      record: undefined,
    });
    const l = parseSettledLogs(["settled:record number=3 sender=a.near key=k", "settled:forwarded record=3"]);
    expect(l.recordNumber).toBe(3);
    expect(l.forwarded).toBe(3);
  });
});

describe("decodeOutcome", () => {
  it("collects logs from all receipts and decodes the return value", () => {
    const r = decodeOutcome({
      transaction: { hash: "TX1" },
      transaction_outcome: { outcome: { logs: [] } },
      receipts_outcome: [{ outcome: { logs: ["a"] } }, { outcome: { logs: ["b", "c"] } }],
      status: { SuccessValue: Buffer.from('"2000000"').toString("base64") },
    });
    expect(r.txHash).toBe("TX1");
    expect(r.logs).toEqual(["a", "b", "c"]);
    expect(r.value).toBe("2000000");
    expect(r.failed).toBe(false);
  });
});
