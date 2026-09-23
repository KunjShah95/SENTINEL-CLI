import type { Metadata } from "next";
import { CodeBlock } from "@/components/CodeBlock";

export const metadata: Metadata = { title: "MCP server" };

export default function Mcp() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Extend</p>
      <h1 className="text-3xl font-semibold tracking-tight">MCP server</h1>
      <p className="text-muted">Expose Sentinel to Claude Desktop, Cursor, or any MCP client over stdio. Tools: <code className="font-mono text-[13px] text-paper">sentinel_health</code>, <code className="font-mono text-[13px] text-paper">sentinel_ask</code>, <code className="font-mono text-[13px] text-paper">sentinel_review_diff</code>.</p>

      <h2 className="pt-4 text-xl font-semibold">Run</h2>
      <CodeBlock label="bash" code={"sentinel mcp"} />

      <h2 className="pt-4 text-xl font-semibold">Client config</h2>
      <CodeBlock label="mcp.json" language="json" code={'{\n  "mcpServers": {\n    "sentinel": { "command": "npx", "args": ["-y", "sentinel-cli", "mcp"] }\n  }\n}'} />
    </>
  );
}
