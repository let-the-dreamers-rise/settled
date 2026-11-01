"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { run, txLink } from "@/lib/fixture";

type Phase = "empty" | "loading" | "steps" | "retrying" | "refused" | "error";

const STEP_IDS: Record<string, string> = {
  record: "step-record",
  forwarded: "step-forwarded",
  "1click": "step-1click",
  settled: "step-settled",
};

/** Replays the recorded run step by step. Nothing here touches the chain or 1Click. */
export function Console() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [shown, setShown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const steps = run.steps ?? [];
  const valid = steps.length > 0 && Boolean(run.refusal?.tx_hash);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function later(ms: number, fn: () => void) {
    timers.current = [...timers.current, setTimeout(fn, ms)];
  }

  function runPayment() {
    if (!valid) return setPhase("error");
    setPhase("loading");
    setShown(0);
    later(300, () => setPhase("steps"));
    steps.forEach((_, i) => later(300 + (i + 1) * 350, () => setShown(i + 1)));
  }

  function retry() {
    setPhase("retrying");
    later(300, () => setPhase("refused"));
  }

  const done = shown >= steps.length;
  const refund = txLink(run.refusal?.tx_hash ?? "");

  return (
    <section aria-live="polite">
      {phase === "empty" && (
        <div className="card" data-testid="console-empty">
          <p>No payments yet. Run the recorded payment.</p>
          <button className="btn" data-testid="run-payment" onClick={runPayment}>Run the recorded payment</button>
        </div>
      )}

      {phase === "error" && (
        <div className="card error" data-testid="console-error" role="alert">
          <p>The recorded run could not be loaded (fixtures/run.json is missing steps or the refusal).</p>
          <button className="btn secondary" data-testid="console-retry" onClick={() => setPhase("empty")}>Retry</button>
        </div>
      )}

      {phase === "loading" && (
        <div data-testid="timeline-skeleton" aria-busy="true">
          {steps.map((s) => <div key={s.id} className="skel skel-row" />)}
        </div>
      )}

      {(phase === "steps" || phase === "retrying" || phase === "refused") && (
        <div className="card">
          <p className="mono">
            settled pay --to 0x1111...1111 --chain base --asset {run.symbol} --amount {run.amount} --key {run.key}
          </p>
          <ol className="timeline" data-testid="timeline">
            {steps.slice(0, shown).map((s) => {
              const link = s.tx_hash ? txLink(s.tx_hash) : null;
              return (
                <li key={s.id} className={s.id === "settled" ? "ok" : ""} data-testid={STEP_IDS[s.id] ?? `step-${s.id}`} id={s.tx_hash ? `tx-${s.tx_hash}` : undefined}>
                  <span>{s.label}</span>
                  {link && <div className="small mono">tx <a href={link.href}>{link.text}</a></div>}
                </li>
              );
            })}
            {!done && <li className="skel skel-row" aria-hidden="true" />}
          </ol>
          {done && phase === "steps" && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" data-testid="retry-same-key" onClick={retry}>Retry with the same key</button>
            </div>
          )}
        </div>
      )}

      {phase === "retrying" && <div className="skel skel-row" style={{ height: 160, marginTop: 16 }} aria-busy="true" />}

      {phase === "refused" && (
        <div className="counterfoil" data-testid="refused-card" style={{ marginTop: 16 }}>
          <div>
            <p className="mono">settled pay ... --key {run.key} --force-send</p>
            <p>
              Key {run.key} is record #{run.record.number}. The contract refused the retry with reason{" "}
              <strong>{run.refusal.reason}</strong> and returned {run.refusal.refunded} {run.symbol} in the same
              transaction. Nothing was sent to 1Click.
            </p>
            <p className="small mono">
              refund tx <a data-testid="refused-refund-link" href={refund.href}>{refund.text}</a>
            </p>
            <Link className="btn" data-testid="open-receipt" href={`/r/${run.payer}/${run.key}`}>Open the receipt</Link>
          </div>
          <div className="stamp-area"><span className="stamp refused">REFUSED</span></div>
        </div>
      )}
    </section>
  );
}
