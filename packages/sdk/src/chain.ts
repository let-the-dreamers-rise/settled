/** Chain access behind two small interfaces, so the SDK runs the same against mainnet, the
 * local sandbox, or a test double. */

export interface Viewer {
  view<T>(contractId: string, method: string, args?: Record<string, unknown>): Promise<T>;
}

export interface CallResult {
  txHash: string;
  logs: string[];
  /** Decoded JSON return value of the transaction, if any. */
  value: unknown;
  failed: boolean;
  error?: string;
}

export interface CallOptions {
  gasTgas: number;
  depositYocto: string;
}

export interface ChainClient extends Viewer {
  readonly accountId: string;
  call(contractId: string, method: string, args: Record<string, unknown>, opts: CallOptions): Promise<CallResult>;
}

export class RpcError extends Error {}

/** Read-only JSON-RPC view call. No key, no signing. */
export async function viewRpc<T>(
  rpcUrl: string,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "settled",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as {
    error?: { message?: string; data?: unknown };
    result?: { result?: number[]; error?: string };
  };
  if (body.error) throw new RpcError(`RPC error: ${body.error.message ?? JSON.stringify(body.error.data)}`);
  if (body.result?.error) throw new RpcError(`view error: ${body.result.error}`);
  const bytes = body.result?.result;
  if (!Array.isArray(bytes)) throw new RpcError("RPC returned no result bytes");
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
}

export class RpcViewer implements Viewer {
  constructor(private readonly rpcUrl: string) {}
  view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    return viewRpc<T>(this.rpcUrl, contractId, method, args);
  }
}

/** Pulls the Settled log lines out of a transaction's logs. */
export interface SettledLogs {
  refused?: { reason: string; record?: number };
  recordNumber?: number;
  forwarded?: number;
  forwardFailed?: number;
}

export function parseSettledLogs(logs: string[]): SettledLogs {
  const out: SettledLogs = {};
  for (const line of logs) {
    const refused = /settled:refused reason=([A-Z_]+)(?: record=(\d+))?/.exec(line);
    if (refused) out.refused = { reason: refused[1]!, record: refused[2] ? Number(refused[2]) : undefined };
    const rec = /settled:record number=(\d+)/.exec(line);
    if (rec) out.recordNumber = Number(rec[1]);
    const fwd = /settled:forwarded record=(\d+)/.exec(line);
    if (fwd) out.forwarded = Number(fwd[1]);
    const failed = /settled:forward_failed record=(\d+)/.exec(line);
    if (failed) out.forwardFailed = Number(failed[1]);
  }
  return out;
}
