import { failedExample, run } from "@/lib/fixture";

export const metadata = { title: "Outcomes | Settled" };

function Entry({ id, title, stamp, children }: { id: string; title: string; stamp: string; children: React.ReactNode }) {
  return (
    <div className="counterfoil" data-testid={id}>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
      <div className="stamp-area"><span className={`stamp ${stamp}`}>{title.replace(/_/g, " ")}</span></div>
    </div>
  );
}

export default function OutcomesPage() {
  const refundedDemonstrated = false;
  if (!run?.record) {
    return (
      <div className="card" data-testid="outcomes-empty">
        <p>No outcome examples loaded. Reload the recorded run.</p>
        <a className="btn secondary" data-testid="outcomes-retry" href="/outcomes">Retry</a>
      </div>
    );
  }
  return (
    <>
      <h1>Outcomes</h1>
      <p className="lede">
        The watcher maps every 1Click status to one of five outcomes and writes it on chain. Anything it does not
        recognise stays PENDING; it is never written as SETTLED.
      </p>
      <div className="outcomes">
        <Entry id="outcome-settled" title="SETTLED" stamp="settled">
          <p>1Click reports SUCCESS. Example: record #{run.record.number}, key {run.key}.</p>
          <p><span className="label-box">{run.label}</span></p>
        </Entry>
        <Entry id="outcome-pending" title="PENDING" stamp="pending">
          <p>Waiting for deposit, deposit seen, or processing. Also any unknown status, HTTP error or 429.</p>
        </Entry>
        <Entry id="outcome-incomplete" title="INCOMPLETE" stamp="pending">
          <p>Deposit below the required amount; 1Click is still waiting. Not demonstrated: through Settled the contract forwards exactly the quoted amount.</p>
        </Entry>
        <Entry id="outcome-refunded" title="REFUNDED" stamp="pending">
          <p>{refundedDemonstrated ? "Recorded refund." : "REFUNDED: not demonstrated. No refund has happened in our runs, and we do not fake one."}</p>
        </Entry>
        <Entry id="outcome-failed-no-refund" title="FAILED_NO_REFUND" stamp="failed">
          <p>
            1Click reports FAILED with refundedAmount &quot;0&quot; and no intent hashes. Settled {failedExample.caption}.
          </p>
          <p><span className="label-box" data-testid="outcome-label-recorded">{failedExample.label}</span></p>
          <p className="small"><a href={failedExample.source_url}>{failedExample.source_url}</a></p>
        </Entry>
      </div>
    </>
  );
}
