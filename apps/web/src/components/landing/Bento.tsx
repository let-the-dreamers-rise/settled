import { InView } from "./InView";
import { Reveal } from "./Reveal";

/** Six cards, each with a small looping figure drawn in CSS. Loops run only while the grid is
 * on screen and stop under reduced motion. */

const CARDS = [
  {
    id: "keys",
    title: "Keys belong to a payer",
    body: "Records are keyed by payer and key, so two payers can both use invoice-4417 without colliding.",
    mini: (
      <div className="mini mini-keys">
        <span className="mono">payer-a / invoice-4417 <b>new</b></span>
        <span className="mono">payer-b / invoice-4417 <b>new</b></span>
        <span className="mono">payer-a / invoice-4417 <b className="seen">seen</b></span>
      </div>
    ),
  },
  {
    id: "refuse",
    title: "Refused, not failed",
    body: "A repeat returns the full amount as unused, so the token contract refunds it and the refusal is counted.",
    mini: (
      <div className="mini mini-stamp">
        <span className="mini-stub mono">No. 0001</span>
        <span className="mini-mark">REFUSED</span>
      </div>
    ),
  },
  {
    id: "once",
    title: "Outcomes are written once",
    body: "A separate watcher key calls resolve. SETTLED, REFUNDED and FAILED_NO_REFUND cannot be overwritten.",
    mini: (
      <div className="mini mini-chips">
        <span className="chip pending">PENDING</span>
        <span className="chip settled">SETTLED</span>
        <span className="mini-lock" />
      </div>
    ),
  },
  {
    id: "mcp",
    title: "Agents get a plain answer",
    body: "Over MCP, settled_pay on a used key answers without calling 1Click.",
    mini: (
      <div className="mini mini-json">
        <code className="mono">{`{"sent":false,"status":"ALREADY_RECORDED"}`}</code>
      </div>
    ),
  },
  {
    id: "receipt",
    title: "Receipts anyone can check",
    body: "The receipt page reads get_record from a NEAR RPC and reads it again when you press Verify.",
    mini: (
      <div className="mini mini-receipt">
        <span className="mini-paper" />
        <span className="chip settled">MATCH</span>
      </div>
    ),
  },
  {
    id: "reads",
    title: "The site only reads the chain",
    body: "This site never calls 1Click and never holds a payer key. The paid tier we are testing would read the chain only.",
    mini: (
      <div className="mini mini-reads">
        <span className="mono">NEAR RPC</span>
        <span className="mini-line" />
        <span className="mono">this page</span>
      </div>
    ),
  },
];

export function Bento() {
  return (
    <section className="bento-sec" aria-labelledby="bento-title">
      <Reveal id="bento-title" text="Small parts, each doing one thing." />
      {/* Outer: loops run while on screen. Inner: cards enter once. */}
      <InView className="bento-run" once={false}>
        <InView className="bento stagger">
          {CARDS.map((c) => (
            <article key={c.id} className={`bento-card b-${c.id}`}>
              <div aria-hidden="true">{c.mini}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </InView>
      </InView>
    </section>
  );
}
