"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { REPO_URL } from "@/lib/config";
import { run } from "@/lib/fixture";
import { Reveal } from "./Reveal";

/** A blank stub that tilts toward the cursor, with its layers at different depths. The spring
 * is over-damped: it settles without a bounce, like card on a desk. */

const SPRING = { stiffness: 140, damping: 32, mass: 1 };

export function ClosingCta() {
  const reduce = useReducedMotion() ?? false;
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), SPRING);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), SPRING);

  function onMove(e: PointerEvent<HTMLElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <section className="cta" onPointerMove={onMove} onPointerLeave={onLeave} aria-labelledby="cta-title">
      <motion.div className="cta-stub" style={{ rotateX, rotateY, transformPerspective: 900 }}>
        <span className="mono small cta-layer" style={{ transform: "translateZ(18px)" }}>No. 0002</span>
        <div className="cta-layer" style={{ transform: "translateZ(36px)" }}>
          <Reveal id="cta-title" className="cta-title" text="Read the record yourself." />
        </div>
        <p className="cta-layer" style={{ transform: "translateZ(24px)" }}>
          The receipt for key {run.key} is on NEAR {run.network}. Open it, press Verify, and the page reads it again from the chain.
        </p>
        <div className="row cta-layer" style={{ transform: "translateZ(30px)" }}>
          <Link className="btn" href={`/r/${run.payer}/${run.key}`}>Open the receipt</Link>
          <Link className="btn secondary" href="/console">Watch the recorded run</Link>
          {REPO_URL ? (
            <a className="btn secondary" href={REPO_URL}>Read the repo</a>
          ) : (
            <span className="small">Repo link: added when the repository is public.</span>
          )}
        </div>
      </motion.div>
    </section>
  );
}
