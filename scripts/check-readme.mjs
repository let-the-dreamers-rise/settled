#!/usr/bin/env node
// Greps README.md for the sections the hackathon rules and the spec require.
// `--draft` allows the contract id placeholder (before the M6 mainnet deploy).
import { readFileSync } from "node:fs";

const draft = process.argv.includes("--draft");
const md = readFileSync("README.md", "utf8");
const errors = [];

const GUARANTEE = "A retry through the Settled contract with the same key never pays twice.";
const firstPara = md.split(/\n\s*\n/).find((p) => !p.startsWith("#")) ?? "";
if (!firstPara.includes(GUARANTEE)) errors.push("first paragraph must state the guarantee");

const HEADINGS = [
  "## Reproduce (funds-free)",
  "## What is real, mocked and planned",
  "## Trust boundary",
  "## 1Click terms of service",
  "## Probe results",
  "## Spend log",
  "## Alternatives",
  "## Tests",
  "## AI-generated code",
  "## Pre-existing code",
  "## License",
];
for (const h of HEADINGS) if (!md.includes(`\n${h}\n`)) errors.push(`missing heading: ${h}`);

for (const n of ["exactly-once", "x402receipts", "BasePulse", "wheres-my-swap", "MPP SDK"]) {
  if (!md.includes(n)) errors.push(`Alternatives table must name ${n}`);
}

const BANNED = /\b(revolutionary|seamless|cutting-edge|leverage|empower|unlock|game-changer|harness|robust|next-gen|world-class|supercharge)\b/i;
const banned = md.match(BANNED);
if (banned) errors.push(`banned word: ${banned[0]}`);
if (/\p{Extended_Pictographic}/u.test(md)) errors.push("README contains an emoji");

const placeholder = md.includes("[PLACEHOLDER: contract account id]");
if (placeholder && !draft) errors.push("contract id is still a placeholder (M6 mainnet deploy not done)");
if (!placeholder && !/https:\/\/(testnet\.)?nearblocks\.io\/address\/[a-z0-9._-]+\.(near|testnet)\b/.test(md)) {
  errors.push("README must link the contract on nearblocks.io");
}

if (errors.length) {
  console.error(`check:readme FAILED\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`check:readme OK${placeholder ? " (draft: contract id placeholder allowed)" : ""}`);
