/** Checks a live quote against what the payer asked for before any token moves. Catches the
 * wrong-chain deposit (near/intents#382) and a quote whose refund goes elsewhere. */

import type { QuoteResponse } from "./oneclick.js";

export interface Expected {
  payer: string;
  originAsset: string;
  destinationAsset: string;
  recipient: string;
  amount: string;
  /** Minimum time the quote must still be valid for, in ms. */
  minValidityMs: number;
  /** Skip the deadline check (`--force-send` with a stored quote). */
  skipDeadline?: boolean;
  now?: number;
}

export function preflight(q: QuoteResponse, e: Expected): string[] {
  const errors: string[] = [];
  const req = q.quoteRequest;
  if (!req) return ["quote has no quoteRequest"];
  if (req.refundTo !== e.payer) errors.push(`refundTo is ${req.refundTo}, expected the payer ${e.payer}`);
  if (req.refundType !== "ORIGIN_CHAIN") errors.push(`refundType is ${req.refundType}, expected ORIGIN_CHAIN`);
  if (req.originAsset !== e.originAsset) errors.push(`origin asset is ${req.originAsset}, expected ${e.originAsset}`);
  if (req.destinationAsset !== e.destinationAsset) {
    errors.push(`destination asset is ${req.destinationAsset}, expected ${e.destinationAsset}`);
  }
  if (req.recipient !== e.recipient) errors.push(`recipient is ${req.recipient}, expected ${e.recipient}`);
  if (q.quote?.amountIn !== e.amount) errors.push(`amountIn is ${q.quote?.amountIn}, expected ${e.amount}`);
  if (!q.quote?.depositAddress) errors.push("quote has no depositAddress");
  if (q.quote?.depositMemo) errors.push("deposit address requires a memo; a contract-sent ft_transfer cannot carry it");
  if (!e.skipDeadline) {
    const deadline = Date.parse(q.quote?.deadline ?? req.deadline ?? "");
    const now = e.now ?? Date.now();
    if (Number.isNaN(deadline)) errors.push("quote has no readable deadline");
    else if (deadline - now < e.minValidityMs) errors.push("quote deadline has passed or is too close");
  }
  return errors;
}
