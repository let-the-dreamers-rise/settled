import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

const QA: { q: string; a: ReactNode }[] = [
  {
    q: "Does Settled stop an agent that holds a full-access key?",
    a: "No. An agent with a full-access key can call ft_transfer straight to a deposit address. Settled covers retries that go through the contract. Locked mode, which would close this, is planned and not built.",
  },
  {
    q: "Does it work for payers whose funds are on Base?",
    a: "No. Those payers deposit on their own chain, where the Settled contract cannot be the sender. Base-origin payers through Chain Signatures are planned, not built.",
  },
  {
    q: "Is 1Click real in this demo?",
    a: "No. 1Click has no testnet, so the testnet run uses a MOCK 1Click, and every line it prints starts with MOCK. The contract calls, token transfers, the refusal and the records are real testnet transactions. Whether 1Click accepts a deposit sent by a contract is untested.",
  },
  {
    q: "Who decides that a payment settled?",
    a: "A watcher account set by the owner. It maps 1Click's status to an outcome and writes it once. The record is as trustworthy as that key; the key cannot move funds.",
  },
  {
    q: "Is the quote verified on chain?",
    a: "No. The contract stores a hash of 1Click's signature and quote, so the payer can later show which quote it paid against.",
  },
  {
    q: "What if 1Click fails a payment and refunds nothing?",
    a: (
      <>
        Settled records FAILED_NO_REFUND. It cannot get the money back. <Link href="/outcomes">See every outcome</Link>.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section className="faq" aria-labelledby="faq-title">
      <Reveal id="faq-title" text="Limits, stated plainly." />
      <div className="faq-list">
        {QA.map((x) => (
          <details key={x.q}>
            <summary>{x.q}</summary>
            <div className="faq-body">
              <p>{x.a}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
