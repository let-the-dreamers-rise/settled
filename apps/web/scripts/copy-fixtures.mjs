// Copies the recorded run into the web app. Preference: mainnet, then testnet, then sandbox.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../fixtures");
const dest = resolve(here, "../src/fixtures");
mkdirSync(dest, { recursive: true });
const run = ["run-mainnet-001.json", "run-testnet-001.json", "run-sandbox-001.json"]
  .map((n) => resolve(root, n))
  .find((p) => existsSync(p));
if (!run) throw new Error("no run fixture in fixtures/");
copyFileSync(run, resolve(dest, "run.json"));
copyFileSync(resolve(root, "issue-360-failed.json"), resolve(dest, "issue-360-failed.json"));
console.log(`fixtures: using ${run}`);
