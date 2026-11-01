import { defineConfig, devices } from "@playwright/test";

const live = process.env.E2E_LIVE === "1";
const STUB = "http://127.0.0.1:3920";

// NEXT_PUBLIC_* values are inlined at build time, so the app is always built here with the
// stub URL (never reused), and the browser-side reads reach the stub too.
const buildEnv: Record<string, string> = live ? {} : { NEXT_PUBLIC_NEAR_RPC_URL: STUB, NEAR_RPC_URL: STUB };

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3910", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    ...(live ? [] : [{ command: "node scripts/copy-fixtures.mjs && node scripts/rpc-stub.mjs", url: `${STUB}`, reuseExistingServer: false, timeout: 20_000 }]),
    {
      command: "pnpm build && pnpm start",
      url: "http://127.0.0.1:3910",
      reuseExistingServer: false,
      timeout: 300_000,
      env: { ...buildEnv, NEXT_PUBLIC_DEMO_MODE: "true", NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
