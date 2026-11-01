/** `pnpm e2e:sandbox`: golden path against the local sandbox with MOCK 1Click. Writes
 * fixtures/run-sandbox-001.json. Exits non-zero on any failed assertion. `--only-pay` stops
 * after pay -> SETTLED (`pnpm test:sandbox-pay`). */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startSandbox } from "./env.js";
import { runGolden } from "./golden.js";

const onlyPay = process.argv.includes("--only-pay");
const env = await startSandbox((l) => console.log(l));
let code = 0;
try {
  const fixture = await runGolden(
    {
      network: "sandbox",
      explorer: null,
      source: "sandbox with mock-1click",
      label: "demo data: sandbox with MOCK 1Click",
      settledId: env.settled.accountId,
      tokenId: env.usdc.accountId,
      payerId: env.payer.accountId,
      payerClient: env.payerClient,
      watcherClient: env.watcherClient,
      oneclick: env.oneclick,
      quoteCount: () => env.mock.quotes().length,
    },
    { key: "invoice-4417", to: "0x1111111111111111111111111111111111111111", onlyPay, say: (l) => console.log(l) },
  );
  if (fixture) {
    const out = process.env.SETTLED_FIXTURE_OUT ?? resolve(import.meta.dirname, "../../../fixtures/run-sandbox-001.json");
    mkdirSync(resolve(out, ".."), { recursive: true });
    writeFileSync(out, JSON.stringify(fixture, null, 2));
    console.log(`fixture written: ${out}`);
  }
  console.log("E2E_SANDBOX_PASS");
} catch (e) {
  console.error((e as Error).message);
  code = 1;
} finally {
  await env.close();
}
process.exit(code);
