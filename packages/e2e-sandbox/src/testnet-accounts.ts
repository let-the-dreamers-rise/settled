/** NEAR testnet accounts for the public demo. Keys live in a 0600 file outside the repo
 * (default ~/.settled-testnet/credentials.json) and are never printed. Testnet NEAR is free
 * and has no value; this module never touches mainnet. */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// rpc.testnet.near.org answers 429 "endpoint is deprecated" (seen 2026-11-01).
export const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
export const TESTNET_EXPLORER = "https://testnet.nearblocks.io";
export const CREDENTIALS = process.env.SETTLED_TESTNET_CREDENTIALS || join(homedir(), ".settled-testnet", "credentials.json");

export const ROLES = ["settled", "usdc", "payer", "watcher", "deposit-a", "deposit-b", "deposit-c"] as const;
export type Role = (typeof ROLES)[number];

export interface Credentials {
  network: "testnet";
  root: { accountId: string; privateKey: string };
  accounts: Partial<Record<Role, { accountId: string; privateKey: string }>>;
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS)) return null;
  const c = JSON.parse(readFileSync(CREDENTIALS, "utf8")) as Credentials;
  if (c.network !== "testnet") throw new Error(`${CREDENTIALS} is not a testnet credentials file`);
  return c;
}

export function saveCredentials(c: Credentials): void {
  mkdirSync(dirname(CREDENTIALS), { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS, JSON.stringify(c, null, 2), { mode: 0o600 });
  chmodSync(CREDENTIALS, 0o600);
}

export function account(c: Credentials, role: Role): { accountId: string; privateKey: string } {
  const a = c.accounts[role];
  if (!a) throw new Error(`testnet account for ${role} missing; run pnpm testnet:setup`);
  return a;
}
