import type { PayConfig } from "@settled/sdk";

/** Lazily loads the CLI's env-based config so the MCP server shares one code path with it.
 * Logs go to stderr: stdout belongs to the MCP protocol. */
export async function payConfigFromEnv(env: NodeJS.ProcessEnv, chain: string, asset: string): Promise<PayConfig> {
  const { payConfig } = await import("@settled/cli");
  return payConfig(env, chain, asset, (l: string) => process.stderr.write(`${l}\n`));
}
