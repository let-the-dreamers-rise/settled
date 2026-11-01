/** Scripted MCP client used in the video's agent beat. It is a script, not an AI agent, and
 * the caption says so. It starts the stdio server and calls `settled_pay` once. */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const [to = "", amount = "2", key = "invoice-4417"] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", fileURLToPath(new URL("./server.ts", import.meta.url))],
  env: process.env as Record<string, string>,
});
const client = new Client({ name: "scripted-agent", version: "0.1.0" });
await client.connect(transport);
console.log(`scripted agent -> settled_pay ${JSON.stringify({ to, amount, key })}`);
const res = await client.callTool({ name: "settled_pay", arguments: { to, chain: "base", asset: "USDC", amount, key } });
const content = res.content as { type: string; text: string }[];
console.log(content[0]?.text ?? JSON.stringify(res));
await client.close();
