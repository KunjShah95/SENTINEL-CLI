import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "mcp-server-for-coding-agents",
  title: "Turn any CLI coding agent into an MCP server",
  metaTitle: "Turn a CLI Coding Agent Into an MCP Server",
  description:
    "Why command line coding agents are ideal Model Context Protocol servers, how stdio transport works, and the three mistakes that break a JSON-RPC stream.",
  date: "2026-09-08",
  readingMinutes: 8,
  tags: ["MCP", "Integration", "Protocol"],
  keyword: "mcp server for coding agents",
  related: ["open-source-ai-coding-agents", "local-llm-coding-agent"],
  faq: [
    {
      q: "Can a terminal coding agent be used as an MCP server?",
      a: "Yes, and it is one of the better fits for the protocol. A CLI agent is already a long-lived process that owns a project directory, a model client and a tool allowlist. Exposing it over MCP adds a transport and a tool schema. It does not require restructuring anything. The three things you must get right are the transport, the tool descriptions, and keeping stdout free of logs.",
    },
    {
      q: "What transport should an MCP server use?",
      a: "stdio for anything local. The client spawns the server as a child process and speaks newline-delimited JSON-RPC over its stdin and stdout. It needs no port, no auth, no lifecycle management, and it dies when the client exits. HTTP transports exist for remote or shared servers, but they add an authentication and deployment problem you should not take on for a tool that runs on the same machine as its caller.",
    },
    {
      q: "Why does my MCP server return invalid JSON?",
      a: "Almost always because something wrote to stdout. A stray console.log, a Node warning, a progress bar, or a library that writes progress to stdout will land in the middle of a JSON-RPC frame and desynchronise the stream. Send all diagnostics to stderr instead. This is the single most common MCP integration bug and it presents as a confusing parse error rather than as a logging problem.",
    },
    {
      q: "How many tools should an MCP server expose?",
      a: "Fewer than you think. Every tool competes for the model's attention and for the human's context budget. Expose capabilities, not primitives: one ask-style tool that takes a prompt beats ten thin wrappers around read, grep and patch, because the model can then compose them without spending turns on protocol mechanics.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A terminal coding agent is an unusually good MCP server: it is already a persistent
          process that owns a project directory, a model client and a permission model. Adding
          MCP means adding a transport and a tool schema, not restructuring the agent.
        </p>
        <p>
          Use <strong>stdio transport</strong> for anything local. The three failure modes that eat
          an afternoon are logging to stdout, exposing too many thin tools, and omitting a failure
          mode from the tool description.
        </p>
      </KeyTakeaways>

      <H2 id="why-cli-agents" text="Why a CLI agent is a good MCP server" />
      <p>
        MCP is a JSON-RPC protocol over stdio or HTTP that lets a host application, Claude
        Desktop, Cursor, an IDE, another agent, call tools your program exposes. Most MCP servers
        are small scripts written for this purpose.
      </p>
      <p>
        A coding agent is a different animal. It is a long-lived process that already owns
        everything an MCP server needs:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">A working directory</strong> and an idea of what &ldquo;the
          project&rdquo; means, so relative paths in a tool call resolve the way a human expects.
        </li>
        <li>
          <strong className="text-paper">A model client</strong> with provider fallbacks, cost
          accounting and context compaction already solved.
        </li>
        <li>
          <strong className="text-paper">A permission model</strong>: modes, tool allowlists,
          path sandboxing. Which is exactly the control plane an MCP host wants to inherit rather
          than reimplement.
        </li>
        <li>
          <strong className="text-paper">Sessions on disk</strong>, so two hosts can share a
          conversation rather than each starting from zero.
        </li>
      </ul>
      <p>
        Sentinel is built this way: <code className="font-mono text-[13px] text-paper">sentinel mcp</code>{" "}
        starts the same in-process agent the TUI uses and publishes three tools over stdio. See the{" "}
        <Link href="/docs/mcp" className="underline-offset-4 hover:underline">
          MCP server documentation
        </Link>{" "}
        for the client config.
      </p>

      <H2 id="the-contract" text="The contract: three tools, not thirty" />
      <p>
        The instinct is to publish every capability the agent has. Resist it. Each tool costs the
        calling model a decision, and thin wrappers around primitives are the worst possible trade:
        the model now spends turns on protocol mechanics instead of on your code.
      </p>
      <CompareToolList />
      <p>
        <code className="font-mono text-[13px] text-paper">sentinel_health</code> is the one people
        forget. It returns a cheap, structured answer to &ldquo;is this thing installed, configured
        and working?&rdquo;. Which is the first thing a host model will try, and the first thing
        that fails confusingly if it is missing.
      </p>

      <H2 id="transport" text="Transport: why stdio is the right default" />
      <p>
        With stdio, the client spawns your server as a child process and writes newline-delimited
        JSON-RPC frames to its stdin, reading replies from stdout. The practical consequences:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>No port to choose, no port to collide, nothing to expose on a network.</li>
        <li>No authentication problem, because there is no remote caller to authenticate.</li>
        <li>No lifecycle to manage. If the host exits, the server is reaped with it.</li>
      </ul>
      <CodeBlock
        label="mcp.json"
        language="json"
        code={`{
  "mcpServers": {
    "sentinel": {
      "command": "npx",
      "args": ["-y", "sentinel-cli", "mcp"]
    }
  }
}`}
      />

      <H3 id="stdout" text="The stdout trap" />
      <p>
        The single most common way to break an MCP server is to print to stdout. Not the protocol
        output, anything else. A <code>console.log</code>, a Node deprecation warning, a shell
        script that echoes its own commands, a progress bar: all of it lands between two JSON-RPC
        frames, and the client desynchronises and reports an unhelpful parse error.
      </p>
      <CodeBlock
        label="the fix"
        code={`// stdout belongs to the protocol. Everything else goes to stderr.
console.error("model:", model, "elapsed:", ms);

// and in a shell wrapper, silence the child unless debugging
sentinel mcp 1>&2`}
      />
      <div className="pt-2">
        <Callout title="Rule of thumb" tone="warn">
          If a line you did not intend as protocol output can reach stdout, it eventually will.
          Redirect unconditionally while you debug, then remove the redirect.
        </Callout>
      </div>

      <H3 id="descriptions" text="Tool descriptions are the real API" />
      <p>
        The calling model never sees your implementation. It sees a name, a description, and a
        JSON schema. That makes the description the API surface, and it is where most integrations
        are won or lost.
      </p>
      <p>Three rules, learned the hard way:</p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Write the description for the caller&apos;s decision, not
          for your function.</strong> &ldquo;Runs a read-only review over the current git diff and
          returns findings with file:line evidence&rdquo; beats &ldquo;Reviews code&rdquo; every
          time, because the first one tells the model when to reach for it.
        </li>
        <li>
          <strong className="text-paper">State the failure mode.</strong> If a tool can be refused
          because of a permission mode, say so in the description. A model that does not know why a
          call failed will retry it.
        </li>
        <li>
          <strong className="text-paper">Make optional parameters earn their place.</strong> Every
          optional argument is a branch the model has to reason about on every call.
        </li>
      </ol>

      <H2 id="compose" text="Expose capabilities, not primitives" />
      <p>
        The strongest pattern we have found: expose one entry point that takes a goal, and let the
        agent&rsquo;s own loop decide which internal tools to use. The host model spends one turn
        instead of eight, and it gets the agent&apos;s permission model and cost accounting for
        free.
      </p>
      <CodeBlock
        label="bash"
        code={`# one call, whole loop
sentinel ask "why does auth fail behind the CDN?"

# or, when the host wants a contract first
sentinel outcome "the sync is flaky" --plan`}
      />
      <p>
        The tradeoff is real and worth stating: composability drops, because the host can no longer
        choose the exact tools. For review and health-style calls, expose fine-grained tools. For
        &ldquo;fix this&rdquo;, expose the loop.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Can a terminal coding agent be used as an MCP server?",
            a: "Yes, and it is one of the better fits for the protocol. A CLI agent is already a long-lived process that owns a project directory, a model client and a tool allowlist. Exposing it over MCP adds a transport and a tool schema. It does not require restructuring anything. The three things you must get right are the transport, the tool descriptions, and keeping stdout free of logs.",
          },
          {
            q: "What transport should an MCP server use?",
            a: "stdio for anything local. The client spawns the server as a child process and speaks newline-delimited JSON-RPC over its stdin and stdout. It needs no port, no auth, no lifecycle management, and it dies when the client exits. HTTP transports exist for remote or shared servers, but they add an authentication and deployment problem you should not take on for a tool that runs on the same machine as its caller.",
          },
          {
            q: "Why does my MCP server return invalid JSON?",
            a: "Almost always because something wrote to stdout. A stray console.log, a Node warning, a progress bar, or a library that writes progress to stdout will land in the middle of a JSON-RPC frame and desynchronise the stream. Send all diagnostics to stderr instead. This is the single most common MCP integration bug and it presents as a confusing parse error rather than as a logging problem.",
          },
          {
            q: "How many tools should an MCP server expose?",
            a: "Fewer than you think. Every tool competes for the model's attention and for the human's context budget. Expose capabilities, not primitives: one ask-style tool that takes a prompt beats ten thin wrappers around read, grep and patch, because the model can then compose them without spending turns on protocol mechanics.",
          },
        ]}
      />

      <Cta
        title="Run one in a minute"
        body="sentinel mcp, then paste the config into Claude Desktop or Cursor. No API key work beyond the one you already have."
        href="/docs/mcp"
        cta="MCP setup"
      />
    </>
  ),
} satisfies Post;

function CompareToolList() {
  const tools = [
    {
      name: "sentinel_health",
      body: "Is Sentinel installed, configured, and reachable? Returns structured status, model, providers, working directory, sandbox root.",
    },
    {
      name: "sentinel_ask",
      body: "Run one goal through the full agent loop and return the answer plus its cost. Model is optional and falls back to the configured default.",
    },
    {
      name: "sentinel_review_diff",
      body: "Read-only review of the current git diff, returning findings with file:line evidence. Cannot write in any mode.",
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {tools.map((t) => (
        <li key={t.name} className="rounded-md border border-ink-800 bg-ink-900 p-4">
          <p className="font-mono text-[13px] text-moss">{t.name}</p>
          <p className="mt-1.5 text-sm leading-6 text-muted">{t.body}</p>
        </li>
      ))}
    </ul>
  );
}
