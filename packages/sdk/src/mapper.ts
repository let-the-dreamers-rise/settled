/** Maps a 1Click status response to a Settled outcome. Fails safe: anything unknown is
 * PENDING, never SETTLED. Table: spec section 5 and the 1Click docs status list. */

import type { StatusResponse } from "./oneclick.js";
import type { Outcome } from "./types.js";

export interface Mapped {
  outcome: Outcome;
  flags: string[];
  evidence: Evidence;
}

export interface Evidence {
  status: string;
  updatedAt?: string;
  destinationTx?: string[];
  refundedAmount?: string;
  flags?: string[];
  mock?: boolean;
}

export function mapStatus(res: StatusResponse | null | undefined): Mapped {
  if (!res || typeof res.status !== "string") {
    return pending("MISSING", ["missing_status"]);
  }
  const d = res.swapDetails ?? {};
  const evidence: Evidence = {
    status: res.status,
    updatedAt: res.updatedAt,
    destinationTx: (d.destinationChainTxHashes ?? []).map((t) => t.hash).filter(Boolean),
    refundedAmount: d.refundedAmount,
    mock: res.mock || undefined,
  };
  switch (res.status) {
    case "PENDING_DEPOSIT":
    case "KNOWN_DEPOSIT_TX":
    case "PROCESSING":
      return { outcome: "PENDING", flags: [], evidence };
    case "SUCCESS":
      return { outcome: "SETTLED", flags: [], evidence };
    case "INCOMPLETE_DEPOSIT":
      return { outcome: "INCOMPLETE", flags: [], evidence };
    case "REFUNDED":
      return { outcome: "REFUNDED", flags: [], evidence };
    case "FAILED": {
      const refunded = d.refundedAmount;
      const intents = d.intentHashes;
      if (refunded !== undefined && isPositive(refunded)) {
        return { outcome: "REFUNDED", flags: [], evidence };
      }
      if (refunded === "0" && Array.isArray(intents) && intents.length === 0) {
        return { outcome: "FAILED_NO_REFUND", flags: [], evidence };
      }
      return withFlag({ outcome: "PENDING", flags: [], evidence }, "failed_unclassified");
    }
    default:
      return withFlag({ outcome: "PENDING", flags: [], evidence }, "unknown_status");
  }
}

/** An HTTP error, timeout or 429 is never an outcome. */
export function mapError(httpStatus: number | null): Mapped {
  return pending(httpStatus === 429 ? "HTTP_429" : `HTTP_${httpStatus ?? "ERROR"}`, ["status_unavailable"]);
}

function pending(status: string, flags: string[]): Mapped {
  return { outcome: "PENDING", flags, evidence: { status, flags } };
}

function withFlag(m: Mapped, flag: string): Mapped {
  const flags = [...m.flags, flag];
  return { ...m, flags, evidence: { ...m.evidence, flags } };
}

function isPositive(amount: string): boolean {
  try {
    return BigInt(amount) > 0n;
  } catch {
    return false;
  }
}

/** Evidence goes on chain; keep it compact and under the contract's 2048-byte limit. */
export function evidenceJson(e: Evidence): string {
  const compact = Object.fromEntries(
    Object.entries(e).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
  const s = JSON.stringify(compact);
  return s.length <= 2048 ? s : JSON.stringify({ status: e.status, truncated: true });
}
