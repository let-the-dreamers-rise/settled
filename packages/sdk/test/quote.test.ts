import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileQuoteStore, MemoryQuoteStore, QUOTE_RETENTION_MS, type StoredQuote } from "../src/quote.js";
import type { QuoteResponse } from "../src/oneclick.js";

const T0 = Date.parse("2026-11-01T00:00:00Z");

function entry(key: string, at: number): StoredQuote {
  return {
    contractId: "settled.test.near",
    payer: "payer.test.near",
    key,
    storedAt: new Date(at).toISOString(),
    response: { timestamp: "t", signature: "s", quoteRequest: {} as QuoteResponse["quoteRequest"], quote: { amountIn: "1", amountOut: "1" } },
  };
}

// 1Click ToS s.4.1(e): API data may not be kept for more than 24 hours.
describe("quote store retention", () => {
  it("retention is 24 hours", () => {
    expect(QUOTE_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("file store returns a quote inside the window and drops it after", () => {
    let now = T0;
    const path = join(mkdtempSync(join(tmpdir(), "settled-q-")), "quotes.json");
    const store = new FileQuoteStore(path, () => now);
    store.put(entry("k1", T0));
    now = T0 + QUOTE_RETENTION_MS - 1;
    expect(store.get("settled.test.near", "payer.test.near", "k1")?.key).toBe("k1");
    now = T0 + QUOTE_RETENTION_MS + 1;
    expect(store.get("settled.test.near", "payer.test.near", "k1")).toBeNull();
  });

  it("file store deletes expired quotes from disk on the next write", () => {
    let now = T0;
    const path = join(mkdtempSync(join(tmpdir(), "settled-q-")), "quotes.json");
    const store = new FileQuoteStore(path, () => now);
    store.put(entry("old", T0));
    now = T0 + QUOTE_RETENTION_MS + 1;
    store.put(entry("new", now));
    const onDisk = JSON.parse(readFileSync(path, "utf8")) as Record<string, StoredQuote>;
    expect(Object.values(onDisk).map((e) => e.key)).toEqual(["new"]);
  });

  it("memory store expires the same way", () => {
    let now = T0;
    const store = new MemoryQuoteStore(() => now);
    store.put(entry("k1", T0));
    now = T0 + QUOTE_RETENTION_MS + 1;
    expect(store.get("settled.test.near", "payer.test.near", "k1")).toBeNull();
  });
});
