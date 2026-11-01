import { Console } from "@/components/Console";
import { run } from "@/lib/fixture";

export const metadata = { title: "Console | Settled" };

export default function ConsolePage() {
  return (
    <>
      <h1>Console</h1>
      <p className="lede">
        A replay of one recorded payment and one retry with the same key. <span className="label-box">{run.label}</span>
      </p>
      <Console />
    </>
  );
}
