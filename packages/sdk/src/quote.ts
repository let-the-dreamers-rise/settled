/** Quote hashing and the local quote store. `--force-send` reuses the stored quote (same
 * deposit address, no second quote request), keyed by contract, payer and key. */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { QuoteResponse } from "./oneclick.js";

/** sha256 over 1Click's signature and the quote body. Recorded on chain, not verified there. */
export function quoteHash(q: QuoteResponse): string {
  return createHash("sha256").update(`${q.signature}|${JSON.stringify(q.quote)}`).digest("hex");
}

export interface StoredQuote {
  contractId: string;
  payer: string;
  key: string;
  storedAt: string;
  response: QuoteResponse;
}

export interface QuoteStore {
  get(contractId: string, payer: string, key: string): StoredQuote | null;
  put(entry: StoredQuote): void;
}

/** 1Click ToS s.4.1(e): API data is not kept for more than 24 hours. */
export const QUOTE_RETENTION_MS = 24 * 60 * 60 * 1000;

const id = (c: string, p: string, k: string) => `${c}|${p}|${k}`;

type Clock = () => number;

function fresh(entries: Readonly<Record<string, StoredQuote>>, now: number): Record<string, StoredQuote> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, e]) => {
      const at = Date.parse(e.storedAt);
      return Number.isFinite(at) && now - at <= QUOTE_RETENTION_MS;
    }),
  );
}

export class FileQuoteStore implements QuoteStore {
  constructor(
    private readonly path: string,
    private readonly now: Clock = Date.now,
  ) {}

  private readAll(): Record<string, StoredQuote> {
    try {
      return fresh(JSON.parse(readFileSync(this.path, "utf8")) as Record<string, StoredQuote>, this.now());
    } catch {
      return {};
    }
  }

  get(contractId: string, payer: string, key: string): StoredQuote | null {
    return this.readAll()[id(contractId, payer, key)] ?? null;
  }

  /** Rewrites the file without expired entries, so nothing older than the window stays on disk. */
  put(entry: StoredQuote): void {
    const next = { ...this.readAll(), [id(entry.contractId, entry.payer, entry.key)]: entry };
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, this.path);
  }
}

export class MemoryQuoteStore implements QuoteStore {
  private entries: Readonly<Record<string, StoredQuote>> = {};

  constructor(private readonly now: Clock = Date.now) {}

  get(contractId: string, payer: string, key: string): StoredQuote | null {
    return fresh(this.entries, this.now())[id(contractId, payer, key)] ?? null;
  }

  put(entry: StoredQuote): void {
    this.entries = { ...fresh(this.entries, this.now()), [id(entry.contractId, entry.payer, entry.key)]: entry };
  }
}
