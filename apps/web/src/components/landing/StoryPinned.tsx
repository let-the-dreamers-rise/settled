"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Reveal } from "./Reveal";

/** Pinned, step-by-step stage: a stack of stubs turns over as you scroll, one per step of a
 * payment. Without JS or with reduced motion it is a plain list (see landing-b.css). */

const STEPS = [
  {
    no: "0001",
    title: "Quote, checked",
    body: "The CLI asks 1Click for a quote with refundTo set to the payer, checks the refund address, assets, recipient, amount and deadline, and stores the quote.",
    detail: "preflight OK",
  },
  {
    no: "0002",
    title: "Recorded before money moves",
    body: "The contract checks the message, the token, the key and the deadline. A new key is written to the record before any tokens move.",
    detail: "record #1",
  },
  {
    no: "0003",
    title: "Forwarded once",
    body: "The contract forwards the tokens to the deposit address with a memo naming the payer. A repeated key is refused and the full amount goes back.",
    detail: "settled:payer=... key=...",
  },
  {
    no: "0004",
    title: "Written down for good",
    body: "A separate watcher maps 1Click's status to an outcome and writes it once. The receipt page reads it straight from the chain.",
    detail: "SETTLED",
  },
];

export function StoryPinned() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length))));

  return (
    <section className="story" ref={ref} aria-labelledby="story-title">
      <div className="story-sticky">
        <div className="story-text">
          <Reveal id="story-title" text="How a payment goes through." />
          <ol className="story-steps">
            {STEPS.map((s, i) => (
              <li key={s.no} className={i === active ? "on" : ""}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="story-progress" aria-hidden="true">
            <motion.span style={{ scaleX: scrollYProgress }} />
          </div>
        </div>
        <div className="story-stack" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div key={s.no} className={`story-card ${i < active ? "past" : i === active ? "now" : "next"}`} style={{ zIndex: STEPS.length - i }}>
              <span className="mono small">No. {s.no}</span>
              <strong>{s.title}</strong>
              <span className="mono story-detail">{s.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
