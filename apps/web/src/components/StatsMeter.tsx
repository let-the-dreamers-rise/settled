"use client";

import { useCallback, useEffect, useState } from "react";
import { view } from "@/lib/rpc";
import { fromBaseUnits } from "@/lib/format";
import type { SettledStats } from "@/lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; stats: SettledStats };

export function StatsMeter() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(() => {
    setState({ kind: "loading" });
    view<SettledStats>("get_stats")
      .then((stats) => setState({ kind: "ok", stats }))
      .catch((e: Error) => setState({ kind: "error", message: e.message }));
  }, []);
  useEffect(load, [load]);

  if (state.kind === "loading") {
    return (
      <div className="stats" data-testid="stats-skeleton" aria-busy="true">
        <div className="skel skel-stat" />
        <div className="skel skel-stat" />
        <div className="skel skel-stat" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="card error" data-testid="stats-error" role="alert">
        <p>{state.message}</p>
        <button className="btn secondary" data-testid="stats-retry" onClick={load}>Retry</button>
      </div>
    );
  }
  const volume = state.stats.volume.reduce((sum, v) => sum + BigInt(v.forwarded), 0n).toString();
  return (
    <div data-testid="stats-meter">
      <div className="stats">
        <div className="card stat">
          <span className="n" data-testid="stat-tracked">{state.stats.records_created}</span>
          <span className="l">payments tracked</span>
        </div>
        <div className="card stat">
          <span className="n" data-testid="stat-refused">{state.stats.refusals}</span>
          <span className="l">duplicates refused</span>
        </div>
        <div className="card stat">
          <span className="n" data-testid="stat-volume">{fromBaseUnits(volume)}</span>
          <span className="l">USDC forwarded</span>
        </div>
      </div>
      <p className="small" data-testid="stats-label-test-payments">
        Read live from the contract&apos;s get_stats view. These are our own test payments, not customers.
      </p>
    </div>
  );
}
