import runJson from "@/fixtures/run.json";
import failedJson from "@/fixtures/issue-360-failed.json";
import type { SettledRecord, SettledStats } from "./types";

export interface RunFixture {
  schema: string;
  source: string;
  label: string;
  recorded_at: string;
  network: string;
  explorer: string | null;
  contract_id: string;
  payer: string;
  key: string;
  amount: string;
  symbol: string;
  destination_chain: string;
  steps: { id: string; label: string; tx_hash?: string; at: string }[];
  refusal: { reason: string; tx_hash: string; refunded: string };
  record: SettledRecord;
  stats: SettledStats;
}

export const run = runJson as RunFixture;
export const failedExample = failedJson as {
  label: string;
  source_url: string;
  caption: string;
  note: string;
  status_response: { status: string; swapDetails: { refundedAmount: string; intentHashes: string[] } };
};

/** A transaction link for the recorded run. Sandbox transactions have no public explorer. */
export function txLink(hash: string): { href: string; text: string } {
  if (run.explorer) return { href: `${run.explorer}/txns/${hash}`, text: hash };
  return { href: `/console#tx-${hash}`, text: `${hash} (local sandbox)` };
}
