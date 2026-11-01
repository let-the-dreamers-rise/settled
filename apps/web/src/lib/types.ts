export type Outcome = "PENDING" | "INCOMPLETE" | "SETTLED" | "REFUNDED" | "FAILED_NO_REFUND";

export interface SettledRecord {
  number: number;
  sender: string;
  key: string;
  token: string;
  amount: string;
  quote_hash: string;
  deposit_address: string;
  deadline_ms: number;
  forward: "FORWARDING" | "FORWARDED" | "FORWARD_FAILED";
  outcome: Outcome;
  refused_count: number;
  created_at_ms: number;
  resolved_at_ms: number | null;
  evidence: string | null;
}

export interface SettledStats {
  records_created: number;
  refusals: number;
  volume: { token: string; forwarded: string }[];
}
