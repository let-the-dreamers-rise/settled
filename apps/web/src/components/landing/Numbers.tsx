import type { CSSProperties } from "react";
import { StatsMeter } from "@/components/StatsMeter";
import { InView } from "./InView";
import { Reveal } from "./Reveal";

/** Only numbers we can stand behind: test counts from this repo, and live chain stats. */

const COUNTS = [
  { n: 16, label: "contract sandbox tests pass" },
  { n: 5, label: "contract unit tests pass" },
  { n: 53, label: "TypeScript tests pass" },
  { n: 60, label: "of 60 browser test runs passed" },
];

/** Ledger-style digits that roll to their value. The real number is in the HTML for screen
 * readers and for readers without JS. */
function Rolling({ value }: { value: number }) {
  return (
    <InView as="span" className="roll">
      <span className="sr-only">{value}</span>
      <span className="roll-digits" aria-hidden="true">
        {String(value)
          .split("")
          .map((d, i) => (
            <span className="roll-col" key={i}>
              <span className="roll-strip" style={{ "--d": Number(d), "--i": i } as CSSProperties}>
                {"0123456789".split("").map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          ))}
      </span>
    </InView>
  );
}

export function Numbers() {
  return (
    <section className="numbers" aria-labelledby="numbers-title">
      <Reveal id="numbers-title" text="What we can count." />
      <div className="counts stagger-static">
        {COUNTS.map((c) => (
          <div key={c.label} className="card count">
            <span className="count-n">
              <Rolling value={c.n} />
            </span>
            <span className="l">{c.label}</span>
          </div>
        ))}
      </div>
      <h3 className="numbers-live">Live from the testnet contract</h3>
      <StatsMeter />
    </section>
  );
}
