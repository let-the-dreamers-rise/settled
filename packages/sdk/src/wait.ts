/** Polls the on-chain record until the watcher writes a terminal outcome, or gives up after
 * the quote deadline plus a margin and reports UNRESOLVED. */

import type { Viewer } from "./chain.js";
import { isTerminal, type SettledRecord } from "./types.js";

export interface WaitOptions {
  contractId: string;
  sender: string;
  key: string;
  marginMs?: number;
  pollMs?: number;
  onUpdate?: (r: SettledRecord) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type WaitResult =
  | { resolved: true; record: SettledRecord }
  | { resolved: false; record: SettledRecord | null; reason: "UNRESOLVED" };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitForOutcome(viewer: Viewer, o: WaitOptions): Promise<WaitResult> {
  const sleep = o.sleep ?? defaultSleep;
  const now = o.now ?? Date.now;
  let last: SettledRecord | null = null;
  let lastOutcome = "";
  for (;;) {
    last = await viewer.view<SettledRecord | null>(o.contractId, "get_record", { sender: o.sender, key: o.key });
    if (last && last.outcome !== lastOutcome) {
      lastOutcome = last.outcome;
      o.onUpdate?.(last);
    }
    if (last && isTerminal(last.outcome)) return { resolved: true, record: last };
    const deadline = (last?.deadline_ms ?? now()) + (o.marginMs ?? 10 * 60_000);
    if (now() > deadline) return { resolved: false, record: last, reason: "UNRESOLVED" };
    await sleep(o.pollMs ?? 3000);
  }
}
