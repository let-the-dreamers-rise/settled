import Link from "next/link";
import { run } from "@/lib/fixture";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { Bento } from "@/components/landing/Bento";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { Faq } from "@/components/landing/Faq";
import { HeroStub } from "@/components/landing/HeroStub";
import { Numbers } from "@/components/landing/Numbers";
import { ProofStrip } from "@/components/landing/ProofStrip";
import { Reveal } from "@/components/landing/Reveal";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { StoryPinned } from "@/components/landing/StoryPinned";
import { Toy } from "@/components/landing/Toy";
import "./landing-a.css";
import "./landing-b.css";

export default function Home() {
  return (
    <div className="landing">
      <SmoothScroll />
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">NEAR {run.network} demo. 1Click is MOCK.</p>
        <Reveal as="h1" id="hero-title" text="A retry through Settled never pays twice." />
        <p className="lede">
          Agents retry on timeouts. A cross-chain payment through NEAR Intents 1Click has no answer at pay time, so a
          retry can pay again. Settled is a NEAR contract the payment goes through: a repeated key is refused and
          refunded in the same transaction, and the payer keeps an on-chain record of the outcome.
        </p>
        <HeroStub />
        <div className="row hero-ctas">
          <Link className="btn" href={`/r/${run.payer}/${run.key}`}>Open the receipt</Link>
          <Link className="btn secondary" href="/console">Watch the recorded run</Link>
          <Link className="btn secondary" href="/outcomes">See every outcome</Link>
        </div>
      </section>

      <ProofStrip />

      <section className="limits card" aria-labelledby="limits-title">
        <Reveal as="h3" id="limits-title" text="What it does not do" />
        <p>
          It does not stop an agent that holds a full-access key from sending tokens straight to a deposit address.
          It does not reach payers whose funds sit on Base or another origin chain. The quote hash is recorded, not
          verified on chain. The outcome record is as trustworthy as the watcher key that writes it.
        </p>
      </section>

      <BeforeAfter />
      <StoryPinned />
      <Bento />
      <Toy />
      <Numbers />
      <Faq />

      <section className="pricing" aria-labelledby="pricing">
        <Reveal id="pricing" text="Pricing" />
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
      </section>

      <ClosingCta />
    </div>
  );
}
