/** Minimal client for the NEAR Intents 1Click API. Field names follow the public docs and the
 * `@defuse-protocol/one-click-sdk-typescript` types. Only the payer's own SDK, CLI and
 * watcher call this, under the payer's own credentials; the hosted site never does. */

export const DEFAULT_ONECLICK_BASE = "https://1click.chaindefuser.com";

export type OneClickStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT" | "ANY_INPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  deadline: string;
  quoteWaitingTimeMs?: number;
}

export interface Quote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted?: string;
  amountOut: string;
  amountOutFormatted?: string;
  minAmountIn?: string;
  minAmountOut?: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate?: number;
}

export interface QuoteResponse {
  correlationId?: string;
  timestamp: string;
  signature: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
  mock?: boolean;
}

export interface TxRef {
  hash: string;
  explorerUrl?: string;
}

export interface SwapDetails {
  intentHashes?: string[];
  nearTxHashes?: string[];
  amountIn?: string;
  amountOut?: string;
  originChainTxHashes?: TxRef[];
  destinationChainTxHashes?: TxRef[];
  refundedAmount?: string;
  depositedAmount?: string;
  refundReason?: string | null;
}

export interface StatusResponse {
  correlationId?: string;
  status: string;
  updatedAt?: string;
  swapDetails?: SwapDetails;
  mock?: boolean;
}

export class OneClickError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly body: string,
  ) {
    super(message);
  }
}

export interface OneClickOptions {
  base?: string;
  jwt?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OneClickClient {
  private readonly base: string;
  private readonly jwt?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OneClickOptions = {}) {
    this.base = (opts.base ?? DEFAULT_ONECLICK_BASE).replace(/\/+$/, "");
    this.jwt = opts.jwt || undefined;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private async request<T>(path: string, init: RequestInit & { auth?: boolean }): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body) headers["content-type"] = "application/json";
    if (init.auth && this.jwt) headers.authorization = `Bearer ${this.jwt}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, { ...init, headers, signal: ctrl.signal });
    } catch (e) {
      throw new OneClickError(`1Click request failed: ${(e as Error).message}`, null, "");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) {
      throw new OneClickError(`1Click ${path} returned HTTP ${res.status}`, res.status, text.slice(0, 500));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OneClickError(`1Click ${path} returned non-JSON`, res.status, text.slice(0, 500));
    }
  }

  quote(req: QuoteRequest): Promise<QuoteResponse> {
    return this.request<QuoteResponse>("/v0/quote", {
      method: "POST",
      body: JSON.stringify(req),
      auth: true,
    });
  }

  status(depositAddress: string, depositMemo?: string): Promise<StatusResponse> {
    const q = new URLSearchParams({ depositAddress });
    if (depositMemo) q.set("depositMemo", depositMemo);
    return this.request<StatusResponse>(`/v0/status?${q.toString()}`, { method: "GET" });
  }

  tokens(): Promise<unknown[]> {
    return this.request<unknown[]>("/v0/tokens", { method: "GET" });
  }
}
