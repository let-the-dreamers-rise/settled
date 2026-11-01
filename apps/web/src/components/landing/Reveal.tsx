import { Fragment, type CSSProperties } from "react";
import { InView } from "./InView";

/** Masked word reveal for headlines: each word rises out of its own clip. The text is in the
 * server HTML, so it reads without JS and screen readers get plain words. */
export function Reveal({ as = "h2", text, className = "", id }: { as?: "h1" | "h2" | "h3"; text: string; className?: string; id?: string }) {
  const words = text.split(" ");
  return (
    <InView as={as} className={`reveal ${className}`} id={id}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="rw">
            <span style={{ "--i": i } as CSSProperties}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </InView>
  );
}
