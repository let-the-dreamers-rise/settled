/** near-api-js adapter for `ChainClient`. Keys come from the environment of the process that
 * runs the CLI, MCP server or watcher; they are never logged and never sent anywhere but the
 * configured RPC as signed transactions. */

import { connect, KeyPair, keyStores } from "near-api-js";
import type { CallOptions, CallResult, ChainClient } from "./chain.js";

export interface NearClientConfig {
  networkId: string;
  nodeUrl: string;
  accountId: string;
  privateKey: string;
}

interface Outcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string; outcome?: { logs?: string[] } };
  receipts_outcome?: { outcome?: { logs?: string[]; status?: unknown } }[];
  status?: { SuccessValue?: string; Failure?: unknown } | string;
}

export function decodeOutcome(o: Outcome): CallResult {
  const logs = [
    ...(o.transaction_outcome?.outcome?.logs ?? []),
    ...(o.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? []),
  ];
  const status = typeof o.status === "object" && o.status ? o.status : {};
  let value: unknown = null;
  if ("SuccessValue" in status && status.SuccessValue) {
    const raw = Buffer.from(status.SuccessValue, "base64").toString("utf8");
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  const failed = "Failure" in status;
  return {
    txHash: o.transaction?.hash ?? o.transaction_outcome?.id ?? "",
    logs,
    value,
    failed,
    error: failed ? JSON.stringify((status as { Failure?: unknown }).Failure).slice(0, 500) : undefined,
  };
}

export async function nearClient(cfg: NearClientConfig): Promise<ChainClient> {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(cfg.networkId, cfg.accountId, KeyPair.fromString(cfg.privateKey as never));
  const near = await connect({ networkId: cfg.networkId, nodeUrl: cfg.nodeUrl, keyStore });
  const account = await near.account(cfg.accountId);
  return {
    accountId: cfg.accountId,
    async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
      return (await account.viewFunction({ contractId, methodName: method, args })) as T;
    },
    async call(contractId, method, args, opts: CallOptions): Promise<CallResult> {
      try {
        const outcome = await account.functionCall({
          contractId,
          methodName: method,
          args,
          gas: BigInt(opts.gasTgas) * 10n ** 12n,
          attachedDeposit: BigInt(opts.depositYocto),
        });
        return decodeOutcome(outcome as unknown as Outcome);
      } catch (e) {
        const err = e as { transaction_outcome?: { id?: string }; message?: string };
        return {
          txHash: err.transaction_outcome?.id ?? "",
          logs: [],
          value: null,
          failed: true,
          error: (err.message ?? String(e)).slice(0, 500),
        };
      }
    },
  };
}
