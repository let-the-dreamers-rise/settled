// Local JSON-RPC stub for Playwright. Answers the views the golden path reads (get_stats,
// get_record) from the recorded fixture, so the 10x loop needs no public RPC. Output is
// labelled STUB. Not used by the hosted site.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const run = JSON.parse(readFileSync(resolve(here, "../src/fixtures/run.json"), "utf8"));
const port = Number(process.env.RPC_STUB_PORT ?? 3920);

function answer(method, args) {
  if (method === "get_stats") return run.stats;
  if (method === "get_record" || method === "get_by_key") {
    return args.sender === run.record.sender && args.key === run.record.key ? run.record : null;
  }
  return undefined;
}

createServer((req, res) => {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, headers);
      return res.end("{}");
    }
    const p = body.params ?? {};
    const args = p.args_base64 ? JSON.parse(Buffer.from(p.args_base64, "base64").toString("utf8")) : {};
    const value = answer(p.method_name, args);
    res.writeHead(200, headers);
    if (value === undefined) {
      return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { message: `STUB: unknown method ${p.method_name}` } }));
    }
    const bytes = [...Buffer.from(JSON.stringify(value))];
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { result: bytes, logs: [], block_height: 1 } }));
  });
}).listen(port, "127.0.0.1", () => console.log(`STUB rpc on http://127.0.0.1:${port}`));
