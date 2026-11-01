/** `pay()`: the payer side of Settled.
 *
 * 1. Client-side check: an existing record for (payer, key) means nothing is sent.
 *    `forceSend` skips this (and the deadline check) to show the contract's own refusal.
 * 2. Quote from 1Click with refundTo = payer, stored locally; `forceSend` reuses the stored one.
 * 3. Preflight: refundTo, assets, recipient, amount, deadline, deposit address, no memo.
 * 4. `ft_transfer_call(token, settled, amount, msg)`; the contract refuses or forwards.
 */

import { preflight } from "./preflight.js";
import { quoteHash, type QuoteStore } from "./quote.js";
import { parseSettledLogs, type ChainClient } from "./chain.js";
import type { OneClickClient, QuoteRequest, QuoteResponse } from "./oneclick.js";
import type { OriginToken } from "./assets.js";
import { toBaseUnits } from "./assets.js";
import { isValidKey, type PayMsg, type SettledRecord } from "./types.js";

export interface PayConfig {
  chain: ChainClient;
  contractId: string;
  oneclick: OneClickClient;
  origin: OriginToken;
  destinationAsset: string;
  store: QuoteStore;
  gasTgas?: number;
  quoteValidityMs?: number;
  minValidityMs?: number;
  registerDepositAddress?: boolean;
  log?: (line: string) => void;
}

export interface PayInput {
  to: string;
  amount: string;
  key: string;
  forceSend?: boolean;
}

export type PayStatus = "ALREADY_RECORDED" | "SENT" | "REFUSED" | "FORWARD_FAILED" | "ABORTED";

export interface PayResult {
  status: PayStatus;
  sent: boolean;
  record: SettledRecord | null;
  recordNumber?: number;
  txHash?: string;
  reason?: string;
  errors?: string[];
  depositAddress?: string;
  quoteHash?: string;
  quote?: QuoteResponse;
  refundedAmount?: string;
}

export const DEFAULT_GAS_TGAS = 150;
const ONE_YOCTO = "1";

export async function getRecord(cfg: Pick<PayConfig, "chain" | "contractId">, sender: string, key: string) {
  return cfg.chain.view<SettledRecord | null>(cfg.contractId, "get_record", { sender, key });
}

function buildQuoteRequest(cfg: PayConfig, input: PayInput, amount: string): QuoteRequest {
  return {
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: cfg.origin.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: cfg.destinationAsset,
    amount,
    recipient: input.to,
    recipientType: "DESTINATION_CHAIN",
    refundTo: cfg.chain.accountId,
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + (cfg.quoteValidityMs ?? 10 * 60_000)).toISOString(),
    quoteWaitingTimeMs: 3000,
  };
}

async function obtainQuote(cfg: PayConfig, input: PayInput, amount: string): Promise<QuoteResponse | string> {
  const payer = cfg.chain.accountId;
  if (input.forceSend) {
    const stored = cfg.store.get(cfg.contractId, payer, input.key);
    if (!stored) return "no stored quote for this key; --force-send never requests a new one";
    cfg.log?.("reusing stored quote (no new quote request)");
    return stored.response;
  }
  const response = await cfg.oneclick.quote(buildQuoteRequest(cfg, input, amount));
  cfg.store.put({ contractId: cfg.contractId, payer, key: input.key, storedAt: new Date().toISOString(), response });
  cfg.log?.(`${response.mock ? "MOCK " : ""}quote received: deposit address ${response.quote.depositAddress}`);
  return response;
}

export async function pay(cfg: PayConfig, input: PayInput): Promise<PayResult> {
  if (!isValidKey(input.key)) {
    return { status: "ABORTED", sent: false, record: null, errors: ["key must be 1-64 chars of A-Z a-z 0-9 . _ : -"] };
  }
  const payer = cfg.chain.accountId;
  const amount = toBaseUnits(input.amount, cfg.origin.decimals);

  if (!input.forceSend) {
    const existing = await getRecord(cfg, payer, input.key);
    if (existing && existing.forward !== "FORWARD_FAILED") {
      cfg.log?.(`key ${input.key} is already record #${existing.number} (${existing.outcome}); nothing sent`);
      return { status: "ALREADY_RECORDED", sent: false, record: existing, recordNumber: existing.number };
    }
  }

  const quote = await obtainQuote(cfg, input, amount);
  if (typeof quote === "string") return { status: "ABORTED", sent: false, record: null, errors: [quote] };

  const errors = preflight(quote, {
    payer,
    originAsset: cfg.origin.originAsset,
    destinationAsset: cfg.destinationAsset,
    recipient: input.to,
    amount,
    minValidityMs: cfg.minValidityMs ?? 60_000,
    skipDeadline: input.forceSend,
  });
  if (errors.length > 0) return { status: "ABORTED", sent: false, record: null, errors, quote };
  cfg.log?.("preflight OK (refundTo = payer, assets, recipient, amount, deadline)");

  const depositAddress = quote.quote.depositAddress!;
  const hash = quoteHash(quote);
  const msg: PayMsg = {
    key: input.key,
    quote_hash: hash,
    deposit_address: depositAddress,
    deadline_ms: Date.parse(quote.quote.deadline ?? quote.quoteRequest.deadline),
    ...(cfg.registerDepositAddress ? { register_deposit_address: true } : {}),
  };
  const res = await cfg.chain.call(
    cfg.origin.tokenContract,
    "ft_transfer_call",
    { receiver_id: cfg.contractId, amount, msg: JSON.stringify(msg) },
    { gasTgas: cfg.gasTgas ?? DEFAULT_GAS_TGAS, depositYocto: ONE_YOCTO },
  );
  cfg.log?.(`ft_transfer_call tx ${res.txHash}`);
  const base = { depositAddress, quoteHash: hash, quote, txHash: res.txHash };
  if (res.failed) {
    return { ...base, status: "ABORTED", sent: false, record: null, errors: [res.error ?? "transaction failed"] };
  }

  const logs = parseSettledLogs(res.logs);
  const used = typeof res.value === "string" ? res.value : "0";
  const record = await getRecord(cfg, payer, input.key);
  if (logs.refused) {
    return {
      ...base,
      status: "REFUSED",
      sent: false,
      record,
      recordNumber: logs.refused.record,
      reason: logs.refused.reason,
      refundedAmount: amount,
    };
  }
  if (logs.forwardFailed !== undefined || used === "0") {
    return { ...base, status: "FORWARD_FAILED", sent: false, record, recordNumber: logs.forwardFailed, refundedAmount: amount };
  }
  return { ...base, status: "SENT", sent: true, record, recordNumber: logs.recordNumber ?? record?.number };
}
