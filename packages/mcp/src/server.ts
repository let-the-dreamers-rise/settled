#!/usr/bin/env -S npx tsx
/** stdio MCP server. Configuration comes from the same environment variables as the CLI. */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RpcViewer } from "@settled/sdk";
import { buildServer } from "./tools.js";
import { payConfigFromEnv } from "./env.js";

const env = process.env;
const server = buildServer({
  payConfig: env.PAYER_PRIVATE_KEY ? (chain, asset) => payConfigFromEnv(env, chain, asset) : undefined,
  viewer: env.NEAR_RPC_URL ? new RpcViewer(env.NEAR_RPC_URL) : undefined,
  contractId: env.SETTLED_CONTRACT_ID,
  defaultSender: env.PAYER_ACCOUNT_ID,
  replayFixture: env.SETTLED_REPLAY,
});
await server.connect(new StdioServerTransport());
