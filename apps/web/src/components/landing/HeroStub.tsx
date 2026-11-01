"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/** The hero demo: a counterfoil that can be torn once. The first tear pays; tearing the same
 * stub again gets it stamped REFUSED and the coin slides back to the payer. An illustration
 * of the recorded run, driven by drag, by the button, or once on load. */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const COIN = 40;
type Phase = "ready" | "paying" | "paid" | "retrying" | "refused";

const STATUS: Record<Phase, string> = {
  ready: "Stub No. 0001, key invoice-4417, not used yet.",
  paying: "Paying 2 USDC through the contract...",
  paid: "Paid once. Record #1 written and 2 USDC forwarded toward Base.",
  retrying: "Retrying with the same key...",
  refused: "Refused: DUPLICATE_KEY. The 2 USDC came back in the same transaction chain. Base got 2, not 4.",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function HeroStub() {
  const reduce = useReducedMotion() ?? false;
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [pocket, setPocket] = useState(20);
  const [dest, setDest] = useState(0);
  const [coin, setCoin] = useState(false);
  const busy = useRef(false);
  const p = useMotionValue(0);
  const tear = useMotionValue(0);
  const tilt = useTransform(tear, [0, 26], [0, 3]);
  const x = useTransform(p, (v) => v * Math.max(0, width - COIN));
  // On narrow screens the torn cheque would cover the Base column; tear it less.
  const TORN = width > 0 && width < 420 ? 10 : 26;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const to = useCallback(
    async (mv: typeof p, value: number, duration = 0.48) => {
      if (reduce) return mv.set(value);
      await animate(mv, value, { duration, ease: EASE });
    },
    [reduce],
  );

  const pay = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("paying");
    setPocket(18);
    p.set(0);
    setCoin(true);
    await to(p, 0.5);
    await to(tear, TORN, 0.24);
    await to(p, 1);
    setCoin(false);
    setDest(2);
    setPhase("paid");
    busy.current = false;
  }, [p, tear, to, TORN]);

  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase("retrying");
    setPocket(16);
    p.set(0);
    setCoin(true);
    await to(p, 0.5);
    setPhase("refused");
    if (!reduce) await wait(240);
    await to(tear, TORN, 0.12);
    await to(p, 0);
    setCoin(false);
    setPocket(18);
    busy.current = false;
  }, [p, tear, to, reduce, TORN]);

  const reset = useCallback(async () => {
    if (busy.current) return;
    setPhase("ready");
    setPocket(20);
    setDest(0);
    await to(tear, 0, 0.24);
  }, [tear, to]);

  // Plays the story once on load; the button and drag work the same way afterwards.
  useEffect(() => {
    if (reduce) return;
    let live = true;
    (async () => {
      await wait(700);
      if (live) await pay();
      await wait(900);
      if (live) await retry();
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = phase === "ready" ? pay : phase === "paid" ? retry : phase === "refused" ? reset : null;
  const label = phase === "ready" ? "Pay 2 USDC" : phase === "paid" ? "Retry with the same key" : phase === "refused" ? "Run it again" : "Working...";

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 36 && (phase === "ready" || phase === "paid")) void next?.();
    else void to(tear, phase === "ready" ? 0 : TORN, 0.24);
  }

  return (
    <div className="hs-wrap">
      <div className="hs">
        <div className="hs-end">
          <span className="hs-l">Payer</span>
          <span className="hs-n">{pocket}</span>
          <span className="hs-l">USDC</span>
        </div>
        <div className={`hs-card ${phase}`}>
          <div className="hs-stub">
            <span className="mono hs-no">No. 0001</span>
            <span className="mono hs-key">invoice-4417</span>
            <span className="hs-amt">2 USDC</span>
            {phase === "refused" || phase === "paid" ? (
              <motion.span
                key={phase}
                className={`hs-stamp ${phase === "refused" ? "refused" : "settled"}`}
                initial={reduce ? false : { opacity: 0, scale: 1.14 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.24, ease: EASE }}
              >
                {phase === "refused" ? "REFUSED" : "PAID"}
              </motion.span>
            ) : null}
          </div>
          <motion.div
            className="hs-cheque"
            aria-hidden="true"
            style={{ x: tear, rotate: tilt }}
            drag={next && phase !== "refused" ? "x" : false}
            dragConstraints={{ left: 0, right: 90 }}
            dragElastic={0}
            dragMomentum={false}
            onDragEnd={onDragEnd}
          >
            <span className="hs-l">Pay to Base</span>
            <span className="hs-amt">2 USDC</span>
            <span className="hs-hint">drag to tear</span>
          </motion.div>
        </div>
        <div className="hs-end">
          <span className="hs-l">Base</span>
          <span className="hs-n">{dest}</span>
          <span className="hs-l">USDC</span>
        </div>
        <div className="hs-track" ref={track} aria-hidden="true">
          <motion.span className="hs-coin" style={{ x, opacity: coin ? 1 : 0 }}>2</motion.span>
        </div>
      </div>
      <div className="hs-controls">
        <button className="btn" type="button" onClick={() => void next?.()} disabled={!next}>
          {label}
        </button>
        <p className="small hs-status" aria-live="polite">{STATUS[phase]}</p>
      </div>
      <p className="small hs-note">Illustration of the recorded testnet run: 2 test USDC, key invoice-4417.</p>
    </div>
  );
}
