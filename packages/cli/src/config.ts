/** Reads configuration from the environment. Keys are read here and passed to the chain
 * client; they are never printed. Missing values fail fast with the variable name. */

import { join } from "node:path";
import {
  DEFAULT_ONECLICK_BASE,
  FileQuoteStore,
  OneClickClient,
  RpcViewer,
  nearClient,
  routesFromEnv,
  type ChainClient,
  type PayConfig,
  type WatcherConfig,
} from "@settled/sdk";

export class ConfigError extends Error {}

function need(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new ConfigError(`missing environment variable ${name} (see .env.example)`);
  return v;
}

export function readCommon(env: NodeJS.ProcessEnv = process.env) {
  const network = env.NEAR_NETWORK || "mainnet";
  const rpcUrl = env.NEAR_RPC_URL || (network === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org");
  return { network, rpcUrl, contractId: need(env, "SETTLED_CONTRACT_ID") };
}

export function viewer(env: NodeJS.ProcessEnv = process.env) {
  const c = readCommon(env);
  return { ...c, viewer: new RpcViewer(c.rpcUrl) };
}

export function oneclick(env: NodeJS.ProcessEnv = process.env): OneClickClient {
  return new OneClickClient({ base: env.ONECLICK_API_BASE || DEFAULT_ONECLICK_BASE, jwt: env.ONECLICK_JWT });
}

async function signer(env: NodeJS.ProcessEnv, idVar: string, keyVar: string): Promise<ChainClient> {
  const c = readCommon(env);
  return nearClient({ networkId: c.network, nodeUrl: c.rpcUrl, accountId: need(env, idVar), privateKey: need(env, keyVar) });
}

export async function payConfig(
  env: NodeJS.ProcessEnv,
  chainName: string,
  asset: string,
  log: (l: string) => void,
): Promise<PayConfig> {
  const routes = routesFromEnv(env);
  const origin = routes.origin[asset.toUpperCase()];
  if (!origin) throw new ConfigError(`no origin token configured for ${asset}`);
  const destinationAsset = routes.destination[`${chainName.toLowerCase()}:${asset.toUpperCase()}`];
  if (!destinationAsset) throw new ConfigError(`no route configured for ${chainName}:${asset}`);
  return {
    chain: await signer(env, "PAYER_ACCOUNT_ID", "PAYER_PRIVATE_KEY"),
    contractId: readCommon(env).contractId,
    oneclick: oneclick(env),
    origin,
    destinationAsset,
    store: new FileQuoteStore(env.SETTLED_QUOTE_STORE || join(process.cwd(), ".settled", "quotes.json")),
    gasTgas: env.SETTLED_GAS_TGAS ? Number(env.SETTLED_GAS_TGAS) : undefined,
    registerDepositAddress: env.SETTLED_REGISTER_DEPOSIT === "1",
    log,
  };
}

export async function watcherConfig(env: NodeJS.ProcessEnv, log: (l: string) => void): Promise<WatcherConfig> {
  const senders = (env.WATCH_SENDERS || need(env, "PAYER_ACCOUNT_ID")).split(",").map((s) => s.trim()).filter(Boolean);
  return {
    chain: await signer(env, "WATCHER_ACCOUNT_ID", "WATCHER_PRIVATE_KEY"),
    contractId: readCommon(env).contractId,
    oneclick: oneclick(env),
    senders,
    log,
  };
}
