#!/usr/bin/env node
// Validates the recorded fixtures the web console and outcomes page render from:
// every fixture is labelled with its source, and the shapes match what the pages read.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "fixtures";
const OUTCOMES = ["PENDING", "INCOMPLETE", "SETTLED", "REFUNDED", "FAILED_NO_REFUND"];
const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

function checkRun(file, f) {
  if (f.schema !== "settled-run/1") fail(file, `schema is ${f.schema}`);
  if (!f.source || !f.label) fail(file, "source and label are required");
  const mock = /mock/i.test(f.source ?? "");
  if (mock && !/MOCK/.test(f.label ?? "")) fail(file, "a mock-sourced fixture must say MOCK in its label");
  const r = f.record ?? {};
  if (r.key !== f.key) fail(file, "record.key differs from key");
  if (r.sender !== f.payer) fail(file, "record.sender differs from payer");
  if (!OUTCOMES.includes(r.outcome)) fail(file, `unknown outcome ${r.outcome}`);
  if (f.refusal?.reason !== "DUPLICATE_KEY" || !f.refusal?.tx_hash) fail(file, "refusal must be DUPLICATE_KEY with a tx hash");
  if (r.refused_count < 1) fail(file, "record must show at least one refused retry");
  if (f.mcp?.response?.status !== "ALREADY_RECORDED" || f.mcp?.response?.sent !== false) fail(file, "MCP retry must be ALREADY_RECORDED, sent:false");
  if (!(f.stats?.records_created >= 1)) fail(file, "stats.records_created must be at least 1");
  if (!Array.isArray(f.steps) || !f.steps.every((s) => s.id && s.label)) fail(file, "steps need id and label");
  // 1Click ToS s.4.1(e): a committed fixture keeps transaction records, not raw quote bodies.
  if (!mock && /"(signature|quoteRequest)"\s*:/.test(JSON.stringify(f))) fail(file, "contains a raw 1Click quote body");
}

function checkOutcomeExample(file, f) {
  if (f.schema !== "settled-outcome-example/1") fail(file, `schema is ${f.schema}`);
  if (!/^recorded from /.test(f.label ?? "") || !f.source_url) fail(file, "must say where it was recorded from, with a URL");
  if (!OUTCOMES.includes(f.mapped_outcome)) fail(file, `unknown mapped_outcome ${f.mapped_outcome}`);
  if (f.mapped_outcome === "FAILED_NO_REFUND" && f.caption !== "records this outcome; cannot recover it") {
    fail(file, "FAILED_NO_REFUND example needs the caption from the spec");
  }
}

const files = readdirSync(DIR).filter((n) => n.endsWith(".json"));
if (!files.some((n) => n.startsWith("run-"))) errors.push("no run-*.json fixture");
for (const name of files) {
  let f;
  try {
    f = JSON.parse(readFileSync(join(DIR, name), "utf8"));
  } catch (e) {
    fail(name, `not valid JSON: ${e.message}`);
    continue;
  }
  if (name.startsWith("run-")) checkRun(name, f);
  else checkOutcomeExample(name, f);
}

if (errors.length) {
  console.error(`fixtures:check FAILED\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`fixtures:check OK (${files.join(", ")})`);
