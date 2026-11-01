"use client";

import { useCallback, useEffect, useState } from "react";
import { CONTRACT_ID, EXPLORER, INTENTS_EXPLORER } from "@/lib/config";
import { evidenceOf, fromBaseUnits, when } from "@/lib/format";
import { view } from "@/lib/rpc";
import type { SettledRecord } from "@/lib/types";
import { Hash } from "./Hash";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; record: SettledRecord };

type Verify = { kind: "idle" } | { kind: "checking" } | { kind: "match" } | { kind: "mismatch" } | { kind: "error"; message: string };

const STAMP: Record<string, string> = {
  SETTLED: "settled",
  REFUNDED: "pending",
  PENDING: "pending",
  INCOMPLETE: "pending",
  FAILED_NO_REFUND: "failed",
};

/** Every state renders inside one slot sized to the final receipt, so nothing below it shifts. */
export function Receipt(props: { sender: string; recordKey: string }) {
  return (
    <div className="receipt-slot">
      <ReceiptBody {...props} />
    </div>
  );
}

function ReceiptBody({ sender, recordKey }: { sender: string; recordKey: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [verify, setVerify] = useState<Verify>({ kind: "idle" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    view<SettledRecord | null>("get_record", { sender, key: recordKey })
      .then((record) => setState(record ? { kind: "ok", record } : { kind: "empty" }))
      .catch((e: Error) => setState({ kind: "error", message: e.message }));
  }, [sender, recordKey]);
  useEffect(load, [load]);

  async function onVerify(current: SettledRecord) {
    setVerify({ kind: "checking" });
    try {
      const again = await view<SettledRecord | null>("get_record", { sender, key: recordKey });
      setVerify(JSON.stringify(again) === JSON.stringify(current) ? { kind: "match" } : { kind: "mismatch" });
    } catch (e) {
      setVerify({ kind: "error", message: (e as Error).message });
    }
  }

  if (state.kind === "loading") {
    return (
      <div key="skeleton" className="counterfoil" data-testid="receipt-skeleton" aria-busy="true">
        <div>
          {Array.from({ length: 7 }, (_, i) => <div key={i} className="skel skel-line" />)}
        </div>
        <div className="stamp-area"><div className="skel" style={{ width: 180, height: 60 }} /></div>
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="card" data-testid="receipt-empty">
        <p>No record for this payer and key on this contract ({CONTRACT_ID}).</p>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="card error" data-testid="receipt-error" role="alert">
        <p>{state.message}</p>
        <p className="small">Contract {CONTRACT_ID}. <a href={`${EXPLORER}/address/${CONTRACT_ID}`}>Open it in the explorer</a>.</p>
        <button className="btn secondary" data-testid="receipt-retry" onClick={load}>Retry</button>
      </div>
    );
  }

  const r = state.record;
  const ev = evidenceOf(r.evidence);
  const dest = ev.destinationTx?.[0];
  return (
    // Distinct keys make React mount fresh nodes instead of morphing the skeleton (a counted layout shift).
    <div key="receipt" data-testid="receipt-page">
      <div className="counterfoil">
        <div>
          <p className="small">Record #{r.number} on {CONTRACT_ID}</p>
          <dl className="kv">
            <dt>Key</dt>
            <dd className="mono" data-testid="receipt-key">{r.key}</dd>
            <dt>Outcome</dt>
            <dd data-testid="receipt-outcome">{r.outcome}</dd>
            <dt>Amount</dt>
            <dd>{fromBaseUnits(r.amount)} (token {r.token})</dd>
            <dt>Payer</dt>
            <dd className="mono">{r.sender}</dd>
            <dt>Deposit address</dt>
            <dd className="mono">{r.deposit_address}</dd>
            <dt>Retries refused</dt>
            <dd>{r.refused_count}</dd>
            <dt>Recorded</dt>
            <dd>{when(r.created_at_ms)}</dd>
            <dt>Resolved</dt>
            <dd>{when(r.resolved_at_ms)}{ev.mock ? " (by watcher, MOCK 1Click)" : " (by watcher)"}</dd>
            <dt id="quote-hash">Quote hash</dt>
            <dd><Hash value={r.quote_hash} label="quote hash" /></dd>
          </dl>
        </div>
        <div className="stamp-area" data-testid="receipt-stamp">
          <span className={`stamp ${STAMP[r.outcome] ?? "pending"}`}>{r.outcome.replace(/_/g, " ")}</span>
        </div>
      </div>
      <div className="links small">
        <a data-testid="receipt-link-record" href={`${EXPLORER}/address/${CONTRACT_ID}`}>Record: contract {CONTRACT_ID} in the explorer</a>
        <a data-testid="receipt-link-deposit" href={`${EXPLORER}/address/${r.deposit_address}`}>Deposit address {r.deposit_address}</a>
        {ev.mock ? (
          <a data-testid="receipt-link-destination" href={`${EXPLORER}/address/${r.deposit_address}`}>
            Destination tx: {dest ?? "not reported"} (MOCK 1Click: no real swap happened; link shows the deposit account)
          </a>
        ) : (
          <a data-testid="receipt-link-destination" href={`${INTENTS_EXPLORER}/?depositAddress=${encodeURIComponent(r.deposit_address)}`}>
            Destination tx: {dest ?? "not reported"} (1Click explorer for this deposit)
          </a>
        )}
        <a data-testid="receipt-link-quote-hash" href="#quote-hash">Quote hash (recorded, not verified on chain)</a>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" data-testid="verify-onchain" onClick={() => onVerify(r)} disabled={verify.kind === "checking"}>
          Verify on chain
        </button>
        <span data-testid="verify-result" aria-live="polite">
          {verify.kind === "checking" && "Reading get_record again..."}
          {verify.kind === "match" && "MATCH: a fresh get_record read returns the same record."}
          {verify.kind === "mismatch" && "MISMATCH: the record changed between reads. Reload the page."}
          {verify.kind === "error" && `Could not verify: ${verify.message}`}
        </span>
      </div>
      <p className="small" style={{ marginTop: 16 }}>
        This page reads the contract&apos;s get_record view from a NEAR RPC. It does not render from the recorded run.
      </p>
    </div>
  );
}
