import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd, faqLd } from "@/components/JsonLd";
import { CodeBlock } from "@/components/CodeBlock";
import { Faq, KeyTakeaways } from "@/components/Post";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";

const TITLE = "Compare: Sentinel vs AI IDEs and hosted agents";
const DESCRIPTION =
  "A feature-by-feature comparison of a local terminal coding agent against AI IDEs, hosted agents and closed CLIs, on privacy, cost, models and auditability.";

export const metadata: Metadata = pageMeta({
  title: "Sentinel vs AI IDEs and hosted agents",
  description: DESCRIPTION,
  path: "/compare",
  keywords: [
    "sentinel vs cursor",
    "ai coding agent comparison",
    "open source cursor alternative",
    "local ai coding agent",
  ],
});

const FAQ = [
  {
    q: "Is Sentinel a replacement for Cursor?",
    a: "For whole-codebase work, scripting and SSH, yes. Often better, because the agent has grep, glob and a shell rather than only the open file. For inline autocompletion and visual diff review inside the editor, no: keep the editor for typing and use the agent for changes. The two solve different problems, and most engineers end up running both.",
  },
  {
    q: "Does Sentinel require an account or a subscription?",
    a: "No. It is MIT licensed and runs locally in-process. The only account you may ever need is with a model provider, and that is optional: Ollama and LM Studio need no key at all, and Groq's free tier is the default. Nothing is phoned home except your own LLM API calls.",
  },
  {
    q: "Which models does Sentinel support?",
    a: "One streaming client covers twelve providers: OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, OpenRouter, Ollama and LM Studio. OpenAI-compatible endpoints share one code path, and Anthropic and Gemini use their native protocols. Models are discovered live from provider APIs at runtime.",
  },
  {
    q: "Can I use Sentinel in CI or over SSH?",
    a: "Yes. The headless surface (ask, goal, outcome, watch, budget, handoff, risk) is designed for exactly that, and the MCP stdio server lets any MCP client call the agent. There is no server component to deploy and nothing to authenticate against.",
  },
];

const ROWS: { dim: string; sentinel: string; ide: string; hosted: string }[] = [
  {
    dim: "Runs on your machine",
    sentinel: "Yes, in-process",
    ide: "Client app, vendor backend",
    hosted: "No",
  },
  {
    dim: "Works over SSH / headless",
    sentinel: "First class",
    ide: "Awkward",
    hosted: "Yes",
  },
  {
    dim: "Model choice",
    sentinel: "12 providers + local models",
    ide: "Usually one vendor lineup",
    hosted: "Locked to the vendor",
  },
  {
    dim: "Cost shape",
    sentinel: "Bring your own key, free tier by default",
    ide: "Seat subscription",
    hosted: "Per-seat or usage pricing",
  },
  {
    dim: "Code leaves the machine",
    sentinel: "Only if you use a hosted model",
    ide: "Yes, for agent features",
    hosted: "Yes, always",
  },
  {
    dim: "Fully offline",
    sentinel: "Yes, with Ollama or LM Studio",
    ide: "No",
    hosted: "No",
  },
  {
    dim: "Permission model you can read",
    sentinel: "Yes. It is the source",
    ide: "Opaque",
    hosted: "Opaque",
  },
  {
    dim: "MCP interoperability",
    sentinel: "Server and client",
    ide: "Varies",
    hosted: "Usually server only",
  },
  {
    dim: "Shared team dashboard / SSO",
    sentinel: "No",
    ide: "Usually yes",
    hosted: "Yes",
  },
];

export default function Compare() {
  return (
    <main className="relative">
      <JsonLd
        data={[
          faqLd(FAQ),
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: site.name,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            description:
              "Open source AI coding agent for the terminal. Multi-LLM, sandboxed local tools, sessions as JSON, MCP. No servers, no telemetry.",
            softwareVersion: site.version,
            url: site.url,
            downloadUrl: site.repo,
            license: "https://opensource.org/licenses/MIT",
            author: { "@type": "Person", name: site.author },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            featureList: [
              "12 LLM providers through one client",
              "Sandboxed local tools with per-mode allowlists",
              "Sessions stored as plain JSON on disk",
              "MCP stdio server and client",
              "Per-project cost budgets",
              "Blast-radius gate on migrations, CI, lockfiles and auth",
            ],
          },
        ]}
      />

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-16 sm:px-6 lg:pt-20">
        <Breadcrumbs />
        <p className="mt-8 font-mono text-xs uppercase tracking-wide text-moss">Compare</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl">
          {TITLE}
        </h1>

        <div className="mt-8 max-w-3xl space-y-5">
          <KeyTakeaways>
            <p>
              Sentinel is a <strong>local, open source, multi-model</strong> coding agent. AI IDEs are
              excellent at inline assistance and weak at repeatability. Hosted agents are good at
              long autonomous runs and impossible to audit.
            </p>
            <p>
              Pick by constraint, not by feature count: if your code cannot leave your
              infrastructure, or you need the tool to be scriptable, the choice is not close. If you
              need a managed team dashboard, Sentinel is the wrong product.
            </p>
          </KeyTakeaways>
        </div>

        <div className="mt-14 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Sentinel compared with AI IDEs and hosted agents</caption>
            <thead>
              <tr className="border-b border-ink-800">
                {["Dimension", "Sentinel", "AI IDE", "Hosted agent"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-4 py-3 font-mono text-xs uppercase tracking-wide ${
                      h === "Sentinel" ? "text-moss" : "text-muted"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.dim} className="border-b border-ink-800/60">
                  <th
                    scope="row"
                    className="px-4 py-3 align-top font-medium text-paper"
                  >
                    {r.dim}
                  </th>
                  <td className="px-4 py-3 align-top text-moss">{r.sentinel}</td>
                  <td className="px-4 py-3 align-top text-muted">{r.ide}</td>
                  <td className="px-4 py-3 align-top text-muted">{r.hosted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted">
          Vendor features change frequently. Treat the shape of the trade as durable and verify
          anything time-sensitive against each product&rsquo;s own documentation.
        </p>

        <h2 className="mt-20 text-2xl font-semibold tracking-tight">Where Sentinel wins outright</h2>
        <ul className="mt-5 space-y-4 text-[15px] leading-7 text-muted">
          <li>
            <strong className="text-paper">Auditability.</strong> Every guard rail (sandboxed
            paths, per-mode allowlists, the risk ledger, the blast-radius gate) is a few hundred
            lines of readable JavaScript. You can verify the control instead of trusting a policy
            page.{" "}
            <Link href="/blog/ai-agent-file-permissions" className="text-moss underline-offset-4 hover:underline">
              The full permission model
            </Link>{" "}
            and{" "}
            <Link href="/blog/ai-coding-agent-guardrails" className="text-moss underline-offset-4 hover:underline">
              why the gates are designed to stay switched on
            </Link>
            .
          </li>
          <li>
            <strong className="text-paper">Cost control you can point at.</strong> A free-tier
            default, hard context caps, per-turn receipts and a persisted per-project ceiling.{" "}
            <Link href="/blog/reduce-llm-cost" className="text-moss underline-offset-4 hover:underline">
              How the spend actually works
            </Link>
            .
          </li>
          <li>
            <strong className="text-paper">Offline.</strong> Point it at Ollama or LM Studio and no
            request leaves the machine, the one claim no hosted product can make.{" "}
            <Link href="/blog/local-llm-coding-agent" className="text-moss underline-offset-4 hover:underline">
              Running fully local
            </Link>
            .
          </li>
          <li>
            <strong className="text-paper">Interoperability in both directions.</strong> Sentinel
            speaks MCP as a server and consumes MCP servers, so it sits inside a toolchain instead
            of replacing it.{" "}
            <Link href="/docs/mcp" className="text-moss underline-offset-4 hover:underline">
              MCP setup
            </Link>
            .
          </li>
        </ul>

        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Where it does not</h2>
        <ul className="mt-5 space-y-3 text-[15px] leading-7 text-muted">
          <li>
            <strong className="text-paper">No inline autocomplete.</strong> Not a gap we intend to
            close. Keep your editor for typing.
          </li>
          <li>
            <strong className="text-paper">No team dashboard, SSO or audit log.</strong> If your
            security team reviews agent access centrally, you need a platform product and we would
            rather say so now.
          </li>
          <li>
            <strong className="text-paper">Younger ecosystem.</strong> Fewer integrations, fewer
            blog posts, fewer Stack Overflow answers than the incumbents.
          </li>
        </ul>

        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Try it in five minutes</h2>
        <div className="mt-5">
          <CodeBlock
            label="terminal"
            code={`git clone ${site.repo}.git
cd SENTINEL-CLI
npm install
npm link

export GROQ_API_KEY=gsk_...   # optional: Ollama needs no key at all
sentinel`}
          />
        </div>
        <p className="mt-5 text-[15px] leading-7 text-muted">
          Then check the guard rails are real before you trust them:{" "}
          <Link href="/docs/installation" className="text-moss underline-offset-4 hover:underline">
            installation guide
          </Link>
          ,{" "}
          <Link href="/docs/tools" className="text-moss underline-offset-4 hover:underline">
            tool reference
          </Link>{" "}
          and{" "}
          <Link href="/blog/open-source-ai-coding-agents" className="text-moss underline-offset-4 hover:underline">
            how to choose between open source coding agents
          </Link>
          .
        </p>

        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        <div className="mt-5">
          <Faq items={FAQ} />
        </div>
      </div>
    </main>
  );
}
