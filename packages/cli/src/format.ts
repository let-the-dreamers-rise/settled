/** The exact lines the CLI prints. The video and README quote these, so they are tested. */

import { fromBaseUnits, type PayResult, type SettledRecord } from "@settled/sdk";

export function refusedLine(key: string, r: PayResult, symbol: string, decimals: number): string {
  const amount = r.refundedAmount ? fromBaseUnits(r.refundedAmount, decimals) : "?";
  const rec = r.record;
  const which = rec ? `is record #${rec.number} (${rec.outcome}), reason ${r.reason}` : `was refused, reason ${r.reason}`;
  return `REFUSED: key ${key} ${which}. Contract returned ${amount} ${symbol} in tx ${r.txHash}; nothing sent to 1Click.`;
}

export function alreadyLine(key: string, rec: SettledRecord): string {
  return `ALREADY RECORDED: key ${key} is record #${rec.number} (${rec.outcome}); nothing sent.`;
}

export function sentLines(r: PayResult, symbol: string, decimals: number): string[] {
  const amount = r.record ? fromBaseUnits(r.record.amount, decimals) : "?";
  return [
    `record #${r.recordNumber} written on NEAR`,
    `contract forwarded ${amount} ${symbol} to 1Click deposit address ${r.depositAddress} in tx ${r.txHash}`,
    "PENDING",
  ];
}

export function outcomeLine(rec: SettledRecord, symbol: string, decimals: number, chain: string): string {
  const amount = fromBaseUnits(rec.amount, decimals);
  let tx = "not reported";
  try {
    const ev = rec.evidence ? (JSON.parse(rec.evidence) as { destinationTx?: string[] }) : {};
    if (ev.destinationTx?.length) tx = ev.destinationTx.join(", ");
  } catch {
    tx = "evidence unreadable";
  }
  switch (rec.outcome) {
    case "SETTLED":
      return `SETTLED: ${amount} ${symbol} on ${chain}, tx ${tx}`;
    case "REFUNDED":
      return `REFUNDED: ${amount} ${symbol} returned by 1Click to the quote's refund address`;
    case "FAILED_NO_REFUND":
      return `FAILED_NO_REFUND: 1Click reports the swap failed with no refund. Settled records this; it cannot recover it.`;
    case "INCOMPLETE":
      return "INCOMPLETE: deposit below required amount, waiting for 1Click";
    default:
      return "PENDING";
  }
}
