// Copies the recorded run into the web app. A mainnet recording wins over the sandbox one.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../fixtures");
const dest = resolve(here, "../src/fixtures");
mkdirSync(dest, { recursive: true });
const mainnet = resolve(root, "run-mainnet-001.json");
const run = existsSync(mainnet) ? mainnet : resolve(root, "run-sandbox-001.json");
copyFileSync(run, resolve(dest, "run.json"));
copyFileSync(resolve(root, "issue-360-failed.json"), resolve(dest, "issue-360-failed.json"));
console.log(`fixtures: using ${run}`);
