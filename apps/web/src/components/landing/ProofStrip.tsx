import { EXPLORER } from "@/lib/config";
import { run, txLink } from "@/lib/fixture";
import { InView } from "./InView";

/** A ticker tape of facts from the recorded run and the test suite. No logos, no quotes:
 * every item is something a reader can check. It moves only while on screen. */

const short = (h: string) => (h.length > 14 ? `${h.slice(0, 6)}...${h.slice(-4)}` : h);

function items(): { text: string; href?: string }[] {
  const pay = run.steps[0]?.tx_hash ?? "";
  return [
    { text: `Contract ${run.contract_id} on NEAR ${run.network}`, href: `${EXPLORER}/address/${run.contract_id}` },
    { text: `Payment tx ${short(pay)}`, href: txLink(pay).href },
    { text: `Refused retry tx ${short(run.refusal.tx_hash)}`, href: txLink(run.refusal.tx_hash).href },
    { text: `Record #${run.record.number}: ${run.record.outcome}, ${run.record.refused_count} retry refused` },
    { text: "16 contract sandbox tests pass" },
    { text: "1Click is MOCK here: it has no testnet" },
  ];
}

function List({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="proof-list" aria-hidden={hidden || undefined}>
      {items().map((it) => (
        <li key={it.text}>
          {it.href ? (
            <a href={it.href} tabIndex={hidden ? -1 : undefined}>{it.text}</a>
          ) : (
            <span>{it.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProofStrip() {
  return (
    <InView as="section" className="proof" once={false} aria-label="Facts from the recorded run">
      <div className="proof-track">
        <List />
        <List hidden />
      </div>
    </InView>
  );
}
