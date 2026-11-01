"use client";

import { useState, type FormEvent } from "react";
import { Reveal } from "./Reveal";

/** A playground that applies the contract's key rule in the browser. Nothing is sent. */

const KEY_RE = /^[A-Za-z0-9._:-]{1,64}$/;
type Attempt = { id: number; key: string; ok: boolean; record: number };

export function Toy() {
  const [key, setKey] = useState("invoice-4417");
  const [records, setRecords] = useState<Readonly<Record<string, number>>>({});
  const [attempts, setAttempts] = useState<readonly Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ n: 0, refused: 0 });

  function onPay(e: FormEvent) {
    e.preventDefault();
    if (!KEY_RE.test(key)) {
      setError("A key is 1 to 64 characters: letters, digits, dot, underscore, colon or dash.");
      return;
    }
    setError(null);
    const existing = records[key];
    const record = existing ?? Object.keys(records).length + 1;
    if (existing === undefined) setRecords({ ...records, [key]: record });
    const attempt = { id: tally.n + 1, key, ok: existing === undefined, record };
    setTally({ n: tally.n + 1, refused: tally.refused + (attempt.ok ? 0 : 1) });
    setAttempts([attempt, ...attempts].slice(0, 4));
  }

  function onReset() {
    setRecords({});
    setAttempts([]);
    setTally({ n: 0, refused: 0 });
    setError(null);
  }

  const last = attempts[0];
  const paid = Object.keys(records).length * 2;
  const returned = tally.refused * 2;
  return (
    <section className="toy" aria-labelledby="toy-title">
      <Reveal id="toy-title" text="Try to pay twice." />
      <p className="small">This runs in your browser with the contract&apos;s rule for keys. Nothing is sent anywhere.</p>
      <div className="toy-grid">
        <form className="toy-form card" onSubmit={onPay}>
          <label htmlFor="toy-key">Idempotency key</label>
          <input id="toy-key" className="mono" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
          <div className="toy-chips">
            {["invoice-4417", "invoice-4418"].map((k) => (
              <button key={k} type="button" className="chip-btn mono" onClick={() => setKey(k)}>{k}</button>
            ))}
          </div>
          {error ? <p className="toy-error" role="alert">{error}</p> : null}
          <div className="row">
            <button className="btn" type="submit">Pay 2 USDC</button>
            <button className="btn secondary" type="button" onClick={onReset}>Reset</button>
          </div>
        </form>
        <div className="toy-out">
          <div className="toy-stub">
            <span className="mono small">{last ? `No. ${String(last.record).padStart(4, "0")}` : "No. ----"}</span>
            <span className="mono">{last ? last.key : "no payment yet"}</span>
            {last ? (
              <span key={last.id} className={`stamp ${last.ok ? "settled" : "refused"} toy-stamp`}>{last.ok ? "PAID" : "REFUSED"}</span>
            ) : null}
          </div>
          <dl className="kv toy-totals">
            <dt>Paid out</dt>
            <dd className="mono">{paid} USDC</dd>
            <dt>Returned to you</dt>
            <dd className="mono">{returned} USDC</dd>
          </dl>
          <ol className="toy-log" aria-live="polite">
            {attempts.length === 0 ? <li className="empty">Attempts show up here, newest first.</li> : null}
            {attempts.map((a) => (
              <li key={a.id} className={a.ok ? "ok" : "no"}>
                <span className="mono">{a.key}</span>
                <span>{a.ok ? `record #${a.record} written, 2 USDC forwarded` : `refused, DUPLICATE_KEY, record #${a.record}; 2 USDC returned`}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
