import { CONTRACT_ID, RPC_URL } from "./config";

export class ViewError extends Error {}

function b64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

/** Read-only view call against the configured RPC. No key, no signing, no 1Click. */
export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "settled-web",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: CONTRACT_ID,
          method_name: method,
          args_base64: b64(JSON.stringify(args)),
        },
      }),
    });
  } catch {
    throw new ViewError(`Could not reach the NEAR RPC at ${RPC_URL}.`);
  }
  if (!res.ok) throw new ViewError(`The NEAR RPC returned HTTP ${res.status}.`);
  const body = (await res.json()) as { error?: { message?: string }; result?: { result?: number[]; error?: string } };
  if (body.error) throw new ViewError(`The RPC could not read contract ${CONTRACT_ID}: ${body.error.message ?? "error"}.`);
  if (body.result?.error) throw new ViewError(`Contract ${CONTRACT_ID} returned an error.`);
  const bytes = body.result?.result;
  if (!Array.isArray(bytes)) throw new ViewError("The RPC returned no data.");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}
