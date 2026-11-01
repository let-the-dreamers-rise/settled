# 1Click terms of service: reading for Settled

Verdict: unclear

Source: https://docs.near-intents.org/security-compliance/terms-of-service, page marked "Last Updated: October 7, 2026", section 4.1 re-read in full on 2026-11-01 (the last 5,900 characters of the page, after section 4.1, were not re-read). This is a builder's reading, not legal advice. Tripwire T2 in the spec switches the build to Hold only on "banned"; this reading does not reach "banned", but section 4.1(h) below needs a decision from the human before mainnet.

## s.4.1(a): no standalone API service, proxy, wrapper or gateway for third parties

The clause: the developer will "not build, operate, or offer any product or service that exposes the API or any portion thereof for use by third parties" "as a standalone API service, proxy, wrapper, or gateway".

What Settled does:
- The contract never calls the 1Click API. It sends tokens to a deposit address that the payer's own SDK obtained.
- The SDK, CLI, watcher and MCP server run on the payer's machine under the payer's own 1Click relationship (no JWT needed for quotes, per probe row 2). We do not run any of them for anyone else.
- The hosted site makes no 1Click calls; it reads NEAR RPC views only.

Reading: nothing we operate exposes the API to third parties. The open question is whether publishing an open-source client that other teams run themselves counts as "offering a wrapper". It is closer to the official TypeScript SDK than to a gateway, but the clause does not say. The cut list already keeps out any hosted service that calls 1Click (hosted watcher, quote proxy) until 1Click confirms in writing.

## s.4.1(e): no caching of API data for more than 24 hours

The clause: "not cache, store, or archive API data for more than twenty-four (24) hours, except for static transaction records strictly required for displaying transaction history to End-Users".

What Settled does:
- The local quote store keeps the 1Click quote response so `--force-send` can reuse it. Entries expire after 24 hours and are deleted from disk on the next write (`QUOTE_RETENTION_MS`, tests in `packages/sdk/test/quote.test.ts`).
- The on-chain record keeps the quote hash, deposit address, outcome and an evidence string (1Click status, intent hashes, destination tx hashes, refunded amount). We read this as a static transaction record that is needed to show the payer its transaction history, which is the exception. "Static transaction records" is not defined in the terms.
- `pnpm fixtures:check` fails if a committed non-mock fixture contains a raw quote body (`signature` or `quoteRequest`). `docs/probe-results.md` stores facts, not responses.

## s.4.1(h): unmasked originator, no intermediary wallet that obfuscates

The clause: integrate the API so "every Transaction contains the verifiable, unmasked public wallet address of the originating End-User, and shall not direct traffic through a proxy, mixer, tumbler, or intermediary wallet address that obfuscates the ultimate originator".

This is the main risk, and the pipeline's earlier reading (s.4.1(a) only) missed it. The Settled contract account is the sender of the deposit, so it is an intermediary account by construction.

What Settled does to keep the originator visible:
- The forwarded `ft_transfer` memo is `settled:payer=<payer account> key=<key>` (sandbox test `new_key_forwards_tokens` asserts it).
- The quote's `refundTo` is the payer's own account; preflight aborts otherwise.
- The payer's `ft_transfer_call` and the contract's forward are one public NEAR receipt chain; the on-chain record links payer, key and deposit address.

Reading: Settled does not obfuscate the originator; it names it in the same transaction. A strict reading of "shall not direct traffic through ... intermediary wallet address" could still cover any forwarding contract, whether it obfuscates or not. Unclear. Recommended before M6: ask 1Click in writing (https://partners.near-intents.org) whether a payer-named forwarding contract is acceptable, and keep Hold as the fallback.

## s.4.1(i): disclosures to end users

The README has a Disclosures paragraph: what 1Click is, that on-chain activity carries risk, that Settled guarantees nothing about 1Click's execution, and the limits of the guarantee.

## s.6.4, s.7.7(d), s.12.4: fees and refunds

Fees are non-refundable and 1Click has "no obligation to reverse, retry, refund, or recover any Transaction that fails". Settled promises no refund from 1Click. It records FAILED_NO_REFUND; it cannot recover it.
