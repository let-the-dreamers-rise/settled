# CLAUDE.md: Settled

Copied from the HackForge spec (`runs/near/scratch/spec/CLAUDE.md`); section "Build notes" at the end was added during the build.

## What this is
Settled: for teams whose agents pay out through 1Click from NEAR funds, a retry through Settled never pays twice.
A NEAR contract receives an agent's NEP-141 payment via `ft_transfer_call`, refuses a repeated key and returns the funds in the same transaction chain, forwards a new key to the 1Click deposit address, and keeps an on-chain record of the outcome written by a separate watcher.
Hackathon: NEAR HACKATHON, tracks `agents`, `security`, `business`. Deadline 2026-11-14 23:59 UTC. Solo builder.

## The exact guarantee (first paragraph of the README, also in the video)
A retry through the Settled contract with the same key never pays twice. It does NOT stop an agent with a full-access key from calling `ft_transfer` directly. It does NOT reach payers funded on Base or other origin chains. The quote hash is recorded, not verified on chain. The outcome record is as trustworthy as the watcher key.

## Contract rules
- Records keyed by `(sender_id, key)`.
- Duplicate key: never panic. Return the full amount as unused so state persists (`refused_count += 1`) and the token contract refunds.
- Check order in `ft_on_transfer`: (1) parse msg (`MALFORMED_MSG`), (2) predecessor in `ALLOWED_TOKENS` (`TOKEN_NOT_ALLOWED`, before any record is read or written), (3) duplicate key (`DUPLICATE_KEY`), (4) deadline (`EXPIRED_DEADLINE`), (5) gas, (6) insert and forward. Each refusal returns the full amount and logs `settled:refused reason=<R>`.
- New key: insert record (FORWARDING) before any promise; `ft_transfer` to the deposit address with memo `settled:payer=<sender> key=<key>`; callback sets FORWARDED and returns 0, or FORWARD_FAILED and returns the full amount. FORWARD_FAILED keys are reusable.
- `resolve(sender, key, outcome, evidence)`: watcher only; from FORWARDED records; terminal outcomes (SETTLED, REFUNDED, FAILED_NO_REFUND) are immutable.
- Watcher mapping: `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `PROCESSING` -> PENDING; `SUCCESS` -> SETTLED; `INCOMPLETE_DEPOSIT` -> INCOMPLETE; `REFUNDED` -> REFUNDED; `FAILED` with refund above 0 -> REFUNDED, refund `"0"` and empty `intentHashes` -> FAILED_NO_REFUND, other FAILED shapes -> PENDING `failed_unclassified`; unknown, missing, HTTP error -> PENDING. Never SETTLED on an unknown value.
- Record struct and `get_stats` shape are frozen (`state_layout_snapshot`).

## data-testid names (do not rename; the video stage reuses them)
Global: `mode-badge demo-banner demo-banner-source demo-banner-tx-link nav-console nav-outcomes`
`/`: `stats-meter stat-tracked stat-refused stat-volume stats-skeleton stats-error stats-retry stats-label-test-payments pricing-hypothesis pricing-card pricing-not-charging`
`/console`: `console-empty run-payment timeline-skeleton timeline step-record step-forwarded step-1click step-settled retry-same-key refused-card refused-refund-link open-receipt console-error console-retry`
`/r/[sender]/[key]`: `receipt-page receipt-skeleton receipt-key receipt-outcome receipt-stamp receipt-link-record receipt-link-deposit receipt-link-destination receipt-link-quote-hash verify-onchain verify-result receipt-empty receipt-error receipt-retry`
`/outcomes`: `outcome-settled outcome-refunded outcome-failed-no-refund outcome-pending outcome-incomplete outcomes-empty outcome-label-recorded outcomes-retry`

## Rules
1. Never fake a sponsor API response silently. Any fixture or mock is labelled on screen and in output (`DEMO MODE`, `REPLAY`, `MOCK`), with its source.
2. Never commit secrets. Env var names only in `.env.example`. Payer and watcher keys never go to the hosted site (`pnpm check:secrets`).
3. The hosted site never calls 1Click and never holds a payer key. Only chain views.
4. Every golden-path screen has empty, loading (skeleton sized to the final content), error and success states. No layout shift.
5. Never sign, spend, deploy to mainnet, push, make the repo public or post without the human's explicit yes.
6. The README lists every AI-generated part, separates pre-existing code (none) and states real / mocked / planned. Do not claim REFUNDED unless produced.
7. Plain words; no marketing tone; no emojis. Banned: revolutionary, seamless, cutting-edge, leverage, empower, unlock, game-changer, harness, robust, next-gen, world-class, supercharge.

## Test commands
`pnpm build:contracts` | `cargo test -p settled` | `pnpm test` | `pnpm e2e:sandbox` | `pnpm e2e` | `pnpm check:secrets` | `pnpm check:readme` | `pnpm fixtures:check` | `pnpm probe:quote` (network, no funds, no credentials).

## Deployment (decided 2026-11-01: no funds, so no mainnet)
- The public demo runs on NEAR testnet: contract `settled.settled-demo-53d4c7c8.testnet`, test token `usdc.settled-demo-53d4c7c8.testnet` (mock-ft). Ids in `deploy/testnet.json`; keys in `~/.settled-testnet/credentials.json`, never in the repo.
- 1Click is MOCK on testnet (it has no testnet). Contract-as-sender acceptance by 1Click is untested; say so wherever it matters.
- RPC: `https://test.rpc.fastnear.com` (rpc.testnet.near.org answers 429 deprecated).

## Build notes
- Build and test in Linux or WSL2 (Ubuntu 24.04). Rust 1.86.0 is pinned (`rust-toolchain.toml`); `near-sdk` and `near-contract-standards` are pinned to `=5.6.0` because later 5.x needs a newer rustc.
- The wasm must be MVP-only for the sandbox/protocol: `scripts/build-contracts.sh` builds with `-C target-cpu=mvp` and runs `wasm-opt` 116 (`cargo install wasm-opt --version 0.116.1 --locked`) with `--signext-lowering --strip-target-features`, then validates with `--mvp-features`. apt's binaryen is too old.
- 1Click ToS s.4.1(e): quote store entries expire after 24 h. s.4.1(h): the forward memo names the payer. See `docs/tos-reading.md`.
