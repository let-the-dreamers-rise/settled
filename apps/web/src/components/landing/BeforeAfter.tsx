"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal";

/** Scroll-scrubbed comparison. The same three moments play on both sides; only the right one
 * has a record to check, so its second payment is stamped and returned. */

const LEFT = [
  "The agent pays 2 USDC. 1Click has no answer yet.",
  "Timeout. The agent retries.",
  "A second 2 USDC is sent.",
];
const RIGHT = [
  "The agent pays 2 USDC. Record #1 is written first.",
  "Timeout. The agent retries with the same key.",
  "Refused: DUPLICATE_KEY. The 2 USDC comes back in the same transaction chain.",
];

function stepOf(v: number): number {
  return v < 0.2 ? 0 : v < 0.45 ? 1 : v < 0.7 ? 2 : 3;
}

export function BeforeAfter() {
  const ref = useRef<HTMLElement>(null);
  // Server HTML shows the end state, so it reads correctly without JS.
  const [step, setStep] = useState(3);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.55"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(stepOf(v)));
  useEffect(() => setStep(stepOf(scrollYProgress.get())), [scrollYProgress]);

  const leftPaid = step >= 3 ? 4 : step >= 1 ? 2 : 0;
  const rightPaid = step >= 1 ? 2 : 0;
  return (
    <section className="ba" ref={ref} aria-labelledby="ba-title">
      <Reveal id="ba-title" text="The same timeout, two endings." />
      <div className="ba-progress" aria-hidden="true">
        <motion.span style={{ scaleX: scrollYProgress }} />
      </div>
      <div className="ba-grid">
        <Side title="Without a shared record" rows={LEFT} step={step} paid={leftPaid} bad />
        <Side title="Through Settled" rows={RIGHT} step={step} paid={rightPaid} />
      </div>
      <p className="small">Illustration. The right-hand ending is what the recorded testnet run did.</p>
    </section>
  );
}

function Side({ title, rows, step, paid, bad }: { title: string; rows: string[]; step: number; paid: number; bad?: boolean }) {
  return (
    <div className={`ba-side ${bad ? "bad" : "good"}`}>
      <h3>{title}</h3>
      <ol className="ba-rows">
        {rows.map((r, i) => (
          <li key={r} className={step > i ? "on" : ""}>
            <span className="mono ba-n">{i + 1}</span>
            <span>{r}</span>
            {!bad && i === 2 ? <span className="ba-stamp" aria-hidden="true">REFUSED</span> : null}
          </li>
        ))}
      </ol>
      <div className="ba-meter">
        <span className="small">Paid out to Base</span>
        <span className="ba-total mono">{paid} USDC</span>
        <span className="ba-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${paid / 4})` }} />
        </span>
      </div>
    </div>
  );
}
