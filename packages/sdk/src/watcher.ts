/** The watcher: reads open records for the senders it is told about, asks 1Click for the
 * status of each deposit address, maps it, and writes the outcome with `resolve`. It runs
 * under its own key; the record is as trustworthy as that key. */

import type { ChainClient } from "./chain.js";
import { evidenceJson, mapError, mapStatus, type Mapped } from "./mapper.js";
import { OneClickError, type OneClickClient } from "./oneclick.js";
import { isTerminal, type SettledRecord } from "./types.js";

export interface WatcherConfig {
  chain: ChainClient;
  contractId: string;
  oneclick: OneClickClient;
  senders: string[];
  log?: (line: string) => void;
}

export interface WatchAction {
  sender: string;
  key: string;
  record: number;
  from: string;
  to: string;
  flags: string[];
  written: boolean;
  error?: string;
}

async function statusFor(cfg: WatcherConfig, r: SettledRecord): Promise<Mapped> {
  try {
    return mapStatus(await cfg.oneclick.status(r.deposit_address));
  } catch (e) {
    return mapError(e instanceof OneClickError ? e.httpStatus : null);
  }
}

export async function openRecords(cfg: WatcherConfig, sender: string): Promise<SettledRecord[]> {
  const all: SettledRecord[] = [];
  for (let from = 0; ; from += 50) {
    const page = await cfg.chain.view<SettledRecord[]>(cfg.contractId, "list_records", { sender, from, limit: 50 });
    all.push(...page);
    if (page.length < 50) break;
  }
  return all.filter((r) => r.forward === "FORWARDED" && !isTerminal(r.outcome));
}

/** One pass over all open records. Writes only when the outcome changes. */
export async function watchOnce(cfg: WatcherConfig): Promise<WatchAction[]> {
  const actions: WatchAction[] = [];
  for (const sender of cfg.senders) {
    for (const r of await openRecords(cfg, sender)) {
      const mapped = await statusFor(cfg, r);
      const action: WatchAction = {
        sender,
        key: r.key,
        record: r.number,
        from: r.outcome,
        to: mapped.outcome,
        flags: mapped.flags,
        written: false,
      };
      if (mapped.outcome !== r.outcome) {
        const res = await cfg.chain.call(
          cfg.contractId,
          "resolve",
          { sender, key: r.key, outcome: mapped.outcome, evidence: evidenceJson(mapped.evidence) },
          { gasTgas: 30, depositYocto: "0" },
        );
        action.written = !res.failed;
        if (res.failed) action.error = res.error;
      }
      cfg.log?.(
        `${mapped.evidence.mock ? "MOCK " : ""}record #${r.number} ${r.key}: ${mapped.evidence.status} -> ${mapped.outcome}` +
          `${action.written ? " (written)" : ""}${mapped.flags.length ? ` [${mapped.flags.join(",")}]` : ""}`,
      );
      actions.push(action);
    }
  }
  return actions;
}

/** Polls every `intervalMs`, backing off to 60 s while nothing changes and doubling the delay
 * on HTTP errors or 429 so 1Click is never hammered. */
export async function watchLoop(cfg: WatcherConfig, opts: { intervalMs?: number; signal?: AbortSignal } = {}) {
  let delay = opts.intervalMs ?? 10_000;
  while (!opts.signal?.aborted) {
    const actions = await watchOnce(cfg);
    if (actions.some((a) => a.flags.includes("status_unavailable") && a.to === "PENDING")) {
      delay = Math.min(delay * 2, 60_000);
    } else if (actions.some((a) => a.written)) {
      delay = opts.intervalMs ?? 10_000;
    } else {
      delay = Math.min(Math.round(delay * 1.5), 60_000);
    }
    await new Promise((r) => setTimeout(r, delay));
  }
}
