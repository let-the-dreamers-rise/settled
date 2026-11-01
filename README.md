# Settled

A retry through the Settled contract with the same key never pays twice. The contract receives an agent's NEP-141 payment with `ft_transfer_call`, refuses a key it has already seen and returns the funds in the same NEAR transaction chain, forwards a new key to the 1Click deposit address, and keeps an on-chain record of the outcome. It does **not** stop an agent that holds a full-access key from calling `ft_transfer` straight to a deposit address. It does **not** reach payers whose funds sit on Base or another origin chain. The quote hash is recorded, not verified on chain. The outcome record is as trustworthy as the watcher key that writes it.

Built for NEAR HACKATHON (tracks: agents, security, business). Solo builder: Ashwin Goyal.

## Status

| Part | State |
| --- | --- |
| Contract, SDK, watcher, CLI, MCP server, web app | Built; all tests below pass |
| Contract on NEAR testnet | Deployed: [`settled.settled-demo-53d4c7c8.testnet`](https://testnet.nearblocks.io/address/settled.settled-demo-53d4c7c8.testnet), with the test token [`usdc.settled-demo-53d4c7c8.testnet`](https://testnet.nearblocks.io/address/usdc.settled-demo-53d4c7c8.testnet) (mock-ft, no value). Account ids in `deploy/testnet.json` |
| Golden path on testnet | Run on 2026-11-01: payment [`23o4ggKU...`](https://testnet.nearblocks.io/txns/23o4ggKUATqDE6hCbKbf4Zcy2iPsW9iCqxP6z3LfDerv) wrote record #1, the watcher resolved it SETTLED, and the forced retry was refused and refunded in [`5z5ZvZW1...`](https://testnet.nearblocks.io/txns/5z5ZvZW1KKZZHoT9dymW8ERBQTfCowvvzj815zbueLtn). 1Click was MOCK |
| Funds-free 1Click probe (tokens, dry quote) | Run on 2026-11-01, both pass (`docs/probe-results.md`) |
| Mainnet | Not deployed and not planned for the hackathon: no funds. 1Click has no testnet, so whether 1Click accepts a deposit sent by a contract is **untested** |
| Hosted site | Live at [settled-near.vercel.app](https://settled-near.vercel.app): the receipt page and usage meter read the testnet contract; the console replays the recorded testnet run behind a DEMO MODE banner |

Why testnet and MOCK 1Click: the builder has no funds for mainnet, and 1Click runs only on mainnet. Everything except the 1Click swap is real and public on testnet. The first check once funds exist (about USD 5): one real 2 USDC payment through a mainnet copy of the contract, to see whether 1Click credits a deposit whose sender is a contract.

## How it works

1. `settled pay --to <addr> --chain base --asset USDC --amount 2 --key invoice-4417` asks 1Click for a quote with `refundTo` = the payer, checks it (refund address, assets, recipient, amount, deadline, no memo) and stores it locally.
2. The CLI calls `ft_transfer_call(token, settled, amount, msg)` with the key, the quote hash and the deposit address.
3. The contract checks, in order: message parses, the calling token is allowed, the key is new for this payer, the deadline has not passed, enough gas is attached. Any failure logs `settled:refused reason=<R>` and returns the full amount, which the token contract refunds in the same receipt chain.
4. A new key is recorded (number, payer, key, token, amount, quote hash, deposit address) before the contract forwards the tokens with memo `settled:payer=<payer> key=<key>`. If the forward fails, the callback marks it FORWARD_FAILED, returns the amount, and the key can be used again.
5. A watcher, under its own key, maps `GET /v0/status` to an outcome (PENDING, INCOMPLETE, SETTLED, REFUNDED, FAILED_NO_REFUND) and calls `resolve`. Terminal outcomes cannot be overwritten.
6. A retry with the same key, even one that skips the client-side check (`--force-send`), is refused on chain with `DUPLICATE_KEY` and refunded.

The MCP server exposes `settled_pay` and `settled_get_receipt` to an agent; on a recorded key `settled_pay` returns `{"sent":false,"status":"ALREADY_RECORDED",...}` without calling 1Click.

The web app has a receipt page (`/r/<payer>/<key>`) that reads `get_record` from a NEAR RPC and can re-read it on demand ("Verify on chain"), a usage meter that reads `get_stats`, a replay console of a recorded run behind a DEMO MODE banner, and an outcomes page.

## Reproduce (funds-free)

No funds, no keys and no 1Click credentials are needed. Tested on WSL2 Ubuntu 24.04.

Prerequisites: `rustup` (the pinned 1.86.0 toolchain and the `wasm32-unknown-unknown` target install from `rust-toolchain.toml`), `cargo install wasm-opt --version 0.116.1 --locked`, Node 22, pnpm 9.15.4.

```bash
pnpm install
```

```bash
pnpm build:contracts
```

```bash
cargo test -p settled
```

```bash
pnpm test
```

```bash
pnpm e2e:sandbox
```

```bash
pnpm --filter @settled/web exec playwright install --with-deps chromium
```

```bash
pnpm e2e
```

`cargo test` downloads the NEAR sandbox binary on first run. `pnpm e2e:sandbox` deploys the contract and a mock token to a local sandbox, runs the golden path against `mock-1click` (every line it prints starts with `MOCK`), and writes `fixtures/run-sandbox-001.json`. `pnpm e2e` builds the web app and runs Playwright against a local JSON-RPC stub that serves that fixture; any request to a non-local host fails the test. `E2E_LIVE=1 pnpm e2e` runs the same tests against a real RPC.

Optional, needs network but no funds: `pnpm probe:quote` (lists 1Click tokens and asks for a dry quote, which has no deposit address).

### On NEAR testnet (free)

```bash
pnpm testnet:setup
```

```bash
pnpm e2e:testnet
```

`testnet:setup` creates a root account from the public testnet faucet, sub-accounts for the contract, token, payer, watcher and three deposit accounts, deploys both contracts and mints test USDC. Keys are written to `~/.settled-testnet/credentials.json` (mode 0600, outside the repo) and never printed. `e2e:testnet` runs the same golden path as the sandbox against testnet, with MOCK 1Click running locally, and writes `fixtures/run-testnet-001.json`. A key can be used once per contract, so a second run needs `SETTLED_DEMO_KEY=invoice-4418`. `E2E_LIVE=1 pnpm e2e` runs the browser tests against the testnet contract instead of the stub.

## What is real, mocked and planned

| Component | Status |
| --- | --- |
| `settled` contract (Rust, near-sdk 5.6.0) | Real. Deployed on NEAR testnet; sandbox-tested. Not on mainnet |
| Token | Mocked: `mock-ft`, a NEP-141 with open mint, in this repo; deployed on testnet as test USDC with no value |
| 1Click quote, deposit, status | Real client code (the funds-free probe calls the real API). In the sandbox and testnet runs it talks to `mock-1click` (lines prefixed `MOCK`), because 1Click has no testnet. No real swap has happened |
| Deposit addresses | On testnet, plain accounts we created and registered on the test token, handed out by MOCK 1Click |
| Watcher, SDK, CLI | Real, run locally; the watcher uses its own key |
| MCP server | Real tools; the calling agent in the demo is a script |
| Web receipt page and usage meter | Real chain reads (`get_record`, `get_stats`) of the testnet contract through FastNEAR's public RPC; in Playwright they read a local RPC stub unless `E2E_LIVE=1` |
| Web console | Replay of the recorded testnet run, behind a DEMO MODE banner that names its source; its transaction links open the testnet explorer |
| REFUNDED outcome | Not demonstrated. The contract forwards exactly the quoted amount, so a refund cannot be produced on purpose |
| INCOMPLETE outcome | Mapper unit test only |
| FAILED_NO_REFUND outcome | Shape recorded from [near/intents#360](https://github.com/near/intents/issues/360), labelled as the reporter's data. Settled records this outcome; it cannot recover it |
| Pricing card | A hypothesis on the page, marked "Hypothesis. Not charging." No billing exists |
| Planned, not built | Locked mode (owner pre-funds; the agent holds a function-call key limited to `pay`, which closes the full-access bypass); Base-origin payers through Chain Signatures; `pay_and_wait` for on-chain callers; hosted chain-read-only tier (receipt pages, webhooks from `resolve`, finance export) |
| Out of scope | Any hosted service that calls 1Click for someone else (hosted watcher, quote proxy), until 1Click confirms in writing that it is allowed |

## Trust boundary

The refusal of a repeated key is enforced by the contract alone. The outcome (SETTLED and the rest) is written by one watcher account, set by the owner. A compromised watcher key can write a wrong outcome for a forwarded record once (terminal outcomes are immutable); it cannot move funds. The quote hash is a sha256 of 1Click's signature and quote body, stored so the payer can later prove which quote it paid against; the contract cannot verify 1Click's signature.

## 1Click terms of service

Full reading: [`docs/tos-reading.md`](docs/tos-reading.md). Verdict: unclear.

- s.4.1(a), no standalone wrapper or gateway for third parties: nothing we operate calls 1Click for anyone else; the SDK, CLI and watcher run under each payer's own relationship with 1Click, and the hosted site never calls 1Click.
- s.4.1(e), no API data kept past 24 hours except static transaction records: the local quote store expires entries after 24 hours; the on-chain record keeps transaction-history fields only.
- s.4.1(h), the originating wallet must be visible and no intermediary wallet may obfuscate it: the Settled contract is the sender of the deposit, so this is the main open question for any mainnet use. The forward memo names the payer, `refundTo` is the payer, and the payer's own transaction is in the same public receipt chain. Nothing in this hackathon build sends anything to the real 1Click; we will ask 1Click in writing before any mainnet use.

Disclosures (s.4.1(i)): 1Click (NEAR Intents) is a third-party cross-chain swap service; Settled does not operate it and guarantees nothing about its execution, timing, fees or refunds. 1Click's fees are non-refundable under its terms. On-chain payments are final and carry smart-contract and key-management risk. Settled's only guarantee is the sentence at the top of this file, with its stated limits.

## Probe results

From [`docs/probe-results.md`](docs/probe-results.md), run on 2026-11-01 with no credentials:

- `GET /v0/tokens` lists 210 tokens, including USDC on NEAR (`nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals) and USDC on Base (`nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`), the ids the SDK uses.
- A dry quote for 2 USDC (NEAR) to USDC (Base) works without an auth header and returned 1.997402 USDC out. That is the only fee figure this README quotes.
- Not run yet: the same quote with a JWT, the contract-as-sender test against a real deposit address, the funding route, and the mainnet gas measurement. They need a funded mainnet account.

## Spend log

| Date | What | Amount | Transaction |
| --- | --- | --- | --- |
| 2026-11-01 | Testnet accounts, deploys and the golden-path run, paid with free faucet testnet NEAR | USD 0 | [root account](https://testnet.nearblocks.io/address/settled-demo-53d4c7c8.testnet) |

No real money has been spent. A future mainnet check would need about USD 5 for one swap plus storage; the full mainnet demo in the original plan was about USD 25.

## Alternatives

| Project | What it does | When it is the better choice |
| --- | --- | --- |
| [exactly-once](https://github.com/swarmproof/exactly-once) | A Python library (`@once`) that runs an agent's side effect at most once per key, with an off-chain store (memory, SQLite, Redis or Postgres), an on-chain adapter and a held state that asks the payments API before retrying | The agent's own retry is the only risk and an off-chain store you run is enough. Cheaper than Settled, and it covers more chains |
| [x402receipts](https://github.com/x402receipts/x402receipts) | Payer-side receipts for x402 purchases on Base and Solana, reconciled against the USDC transfer; USD 1 per agent wallet per month | The payer pays with x402 on Base or Solana, which Settled cannot reach |
| [BasePulse PR #74](https://github.com/Abuchtela/BasePulse/pull/74) | A treasury agent with the 1Click SDK, idempotency and audit receipts in MySQL | You want an off-chain treasury agent; its own review notes concurrent preparations can overwrite idempotency records |
| [wheres-my-swap](https://github.com/cryppit/wheres-my-swap) | A read-only tracer of a 1Click order across chains, after the fact | Diagnosing a stuck or misrouted swap. Settled does not trace; it records |
| [MPP SDK (NEAR Intents method)](https://github.com/defuse-protocol/nearintents-mpp-sdk) | The official payment method: quotes, challenges, deposit verification, settlement polling, replay protection | Merchant-side payments where the payer deposits on its origin chain and refunds go to the merchant's `refundTo` |

Settled's narrow claim: a NEAR contract is the sender of the 1Click deposit, so the refusal of a repeated key happens in the same contract call that would have moved the money (no gap between "check" and "send"), and the payer keeps an on-chain record of what happened.

## Tests

| Suite | Command | Count |
| --- | --- | --- |
| Contract unit tests (including the state-layout snapshot) | `cargo test -p settled --lib` | 5 |
| Contract sandbox tests: duplicate key, concurrent same key, fake token, wrong token, expired deadline, malformed msg, insufficient gas, forward failed and reused, unauthorised resolve, terminal outcome, keys namespaced by sender, and more | `cargo test -p settled --test sandbox` | 16 |
| SDK (mapper, preflight, pay, units, quote retention), mock-1click, CLI, MCP | `pnpm test` | 53 |
| Sandbox golden path with mock 1Click | `pnpm e2e:sandbox` | 1 run |
| Testnet golden path with mock 1Click | `pnpm e2e:testnet` | 1 run (needs `pnpm testnet:setup`) |
| Web: smoke, console, golden, receipt empty state, accessibility at 1280 and 375 px (axe, no horizontal scroll, layout shift under 0.01) | `pnpm e2e` | 6; passed 10 of 10 repeats (60/60) on the stub, and 6 of 6 with `E2E_LIVE=1` against testnet |
| Secrets, README, fixtures | `pnpm check:secrets`, `pnpm check:readme`, `pnpm fixtures:check` | |

## Build notes

- Rust 1.86.0 is pinned. `near-sdk` and `near-contract-standards` are pinned to `=5.6.0`; later 5.x releases need a newer rustc. The workspace uses Cargo resolver 3 with `rust-version = "1.86"`.
- The NEAR sandbox rejects wasm that uses sign-extension ops. `scripts/build-contracts.sh` builds with `-C target-cpu=mvp`, lowers with `wasm-opt` 116 (`--signext-lowering --strip-target-features`) and validates with `--mvp-features`. The binaryen in Ubuntu's apt is too old; install `wasm-opt` with cargo as above.
- On Windows, build inside WSL2. `scripts/wsl-sync.sh` copies a Windows checkout into the WSL home directory, without `node_modules` and build output, because builds on `/mnt` are slow.

## AI-generated code

All code, tests, scripts and docs in this repository were written by Claude (Anthropic, model `claude-opus-5-5`) in Claude Code sessions on 2026-10-31 and 2026-11-01, directed by Ashwin Goyal. The product spec was produced beforehand by a planning pipeline (HackForge) that also used Claude models. This covers:

- `contracts/settled/` (contract, unit tests, sandbox tests) and `contracts/mock-ft/`
- `packages/sdk/`, `packages/mock-1click/`, `packages/cli/`, `packages/mcp/`, `packages/e2e-sandbox/` (sandbox and testnet runners, testnet setup)
- `apps/web/` (Next.js app, RPC stub, Playwright tests)
- `scripts/`, `fixtures/run-sandbox-001.json` and `fixtures/run-testnet-001.json` (generated by the runs), `fixtures/issue-360-failed.json` (transcribed from the public issue), `deploy/testnet.json`, `docs/`, this README, `CLAUDE.md`

Human review of the generated code before submission: pending.

## Pre-existing code

None. No code from before the hackathon is included. Library dependencies only: near-sdk, near-contract-standards, near-workspaces (Rust and JS), near-api-js, @modelcontextprotocol/sdk, zod, Next.js, React, Playwright, @axe-core/playwright, vitest, tsx, TypeScript. Exact versions are in `Cargo.toml`, the `package.json` files and the lockfiles.

## Company

Who pays, as a hypothesis: teams whose agents pay out from NEAR funds and whose finance or support staff need a shareable receipt, outcome webhooks and an audit export. The planned paid tier reads the chain only and never calls 1Click. Price under test: USD 99 per month per team or USD 0.01 per tracked payment. Not charging anyone. Design partner: `[PLACEHOLDER: named design partner]`, none yet.

## License

MIT, see [LICENSE](LICENSE).
