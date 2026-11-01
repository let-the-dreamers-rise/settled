#!/usr/bin/env node
// Fails if a tracked file looks like it carries a secret, or if the web app references a
// private key at all (payer and watcher keys never go to the hosted site).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.endsWith("pnpm-lock.yaml") && !/\.(png|jpg|wasm|ico|woff2?)$/.test(f));

const RULES = [
  { name: "NEAR private key", re: /ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/ },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "assigned secret", re: /^(PAYER_PRIVATE_KEY|WATCHER_PRIVATE_KEY|ONECLICK_JWT|WAITLIST_STORE_TOKEN)=\S+/m },
];

const hits = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const r of RULES) if (r.re.test(text)) hits.push(`${f}: ${r.name}`);
  if (f.startsWith("apps/web/") && /PRIVATE_KEY/.test(text)) hits.push(`${f}: web app references PRIVATE_KEY`);
}

if (hits.length) {
  console.error(`check:secrets FAILED\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`check:secrets OK (${files.length} files scanned)`);
