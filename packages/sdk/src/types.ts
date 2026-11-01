/** Shapes shared by the SDK, watcher, CLI, MCP server and web. They mirror the contract's
 * JSON views (`contracts/settled/src/types.rs`). */

export type Forward = "FORWARDING" | "FORWARDED" | "FORWARD_FAILED";

export type Outcome = "PENDING" | "INCOMPLETE" | "SETTLED" | "REFUNDED" | "FAILED_NO_REFUND";

export const TERMINAL_OUTCOMES: readonly Outcome[] = ["SETTLED", "REFUNDED", "FAILED_NO_REFUND"];

export function isTerminal(o: Outcome): boolean {
  return TERMINAL_OUTCOMES.includes(o);
}

export interface SettledRecord {
  number: number;
  sender: string;
  key: string;
  token: string;
  amount: string;
  quote_hash: string;
  deposit_address: string;
  deadline_ms: number;
  forward: Forward;
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

export type RefusalReason =
  | "MALFORMED_MSG"
  | "TOKEN_NOT_ALLOWED"
  | "DUPLICATE_KEY"
  | "EXPIRED_DEADLINE"
  | "INSUFFICIENT_GAS";

/** What the SDK sends as `msg` in `ft_transfer_call`. */
export interface PayMsg {
  key: string;
  quote_hash: string;
  deposit_address: string;
  deadline_ms: number;
  register_deposit_address?: boolean;
}

const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}
