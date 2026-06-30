#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "sentinel-mcp-server.js");

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const results = [];

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) {
      try {
        results.push(JSON.parse(line));
      } catch { }
    }
  }
});

server.stderr.on("data", (d) => process.stderr.write(d));

function send(msg) {
  server.stdin.write(JSON.stringify(msg) + "\n");
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
});

setTimeout(() => {
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
}, 200);

setTimeout(() => {
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "sentinel_health",
      arguments: {},
    },
  });
}, 400);

setTimeout(() => {
  send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "sentinel_review_diff",
      arguments: {
        diff: `diff --git a/test.js b/test.js\nindex 0000000..0000000 100644\n--- a/test.js\n+++ b/test.js\n@@ -1,3 +1,3 @@\n function getUser(id) {\n-  return "Hello " + name;\n+  return "Hello " + name;\n }`,
        files: ["test.js"],
      },
    },
  });
}, 600);

setTimeout(() => {
  console.log("\n=== MCP Server Test Results ===\n");
  for (const r of results) {
    if (r.id === 1) {
      console.log("✓ Initialize:", r.result?.serverInfo?.name, r.result?.serverInfo?.version);
    }
    if (r.id === 2) {
      const tools = r.result?.tools ?? [];
      console.log(`✓ Tools listed: ${tools.length} tools`);
      tools.forEach((t) => console.log(`  - ${t.name}`));
    }
    if (r.id === 3) {
      const text = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
      const parsed = JSON.parse(text);
      console.log(`✓ sentinel_health: status=${parsed.status}, providers=${parsed.availableCount}`);
    }
    if (r.id === 4) {
      if (r.error) {
        console.log(`✗ sentinel_review_diff error: ${r.error.message}`);
      } else {
        const text = r.result?.content?.[0]?.text ?? '';
        console.log(`✓ sentinel_review_diff returned ${text.length} chars`);
      }
    }
  }
  server.kill();
  process.exit(0);
}, 3000);
