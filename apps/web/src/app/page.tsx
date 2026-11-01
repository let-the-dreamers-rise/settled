import Link from "next/link";
import { StatsMeter } from "@/components/StatsMeter";

export default function Home() {
  return (
    <>
      <h1>A retry through Settled never pays twice.</h1>
      <p className="lede">
        Agents retry on timeouts. A cross-chain payment through NEAR Intents 1Click has no answer at pay time, so a
        retry can pay again. Settled is a NEAR contract the payment goes through: a repeated key is refused and
        refunded in the same transaction, and the payer keeps an on-chain record of the outcome.
      </p>
      <div className="card">
        <h3>What it does not do</h3>
        <p>
          It does not stop an agent that holds a full-access key from sending tokens straight to a deposit address.
          It does not reach payers whose funds sit on Base or another origin chain. The quote hash is recorded, not
          verified on chain. The outcome record is as trustworthy as the watcher key that writes it.
        </p>
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <Link className="btn" href="/console">Open the console</Link>
        <Link className="btn secondary" href="/outcomes">See every outcome</Link>
      </div>

      <h2>Usage</h2>
      <StatsMeter />

      <h2 id="pricing">Pricing</h2>
      <div className="card" data-testid="pricing-hypothesis">
        <div data-testid="pricing-card">
          <p><span className="label-box" data-testid="pricing-not-charging">Hypothesis. Not charging.</span></p>
          <p>
            The contract, SDK, CLI, MCP server and watcher are free and open source. A paid tier we are testing would
            only read the chain: hosted receipt pages, webhooks fired from on-chain outcomes, and a finance export.
            It would never call 1Click for anyone.
          </p>
          <p className="small">Figures under test: USD 99 per team per month, or USD 0.01 per tracked payment. Nobody pays this today.</p>
        </div>
      </div>
    </>
  );
}
