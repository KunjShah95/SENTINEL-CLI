import type { Metadata } from "next";
import { CodeBlock } from "@/components/CodeBlock";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Configuration",
  description:
    "How Sentinel resolves configuration: environment variable, then ~/.sentinel.json, then the project file. Every provider key, local model host and path in one table.",
  path: "/docs/config",
  keywords: ["llm api key configuration", "multi provider config", "sentinel config"],
});

const rows: [string, string][] = [
  ["Groq (free tier)", "GROQ_API_KEY"],
  ["OpenAI", "OPENAI_API_KEY"],
  ["Anthropic", "ANTHROPIC_API_KEY"],
  ["Gemini", "GEMINI_API_KEY"],
  ["DeepSeek", "DEEPSEEK_API_KEY"],
  ["Mistral", "MISTRAL_API_KEY"],
  ["xAI", "XAI_API_KEY"],
  ["OpenRouter", "OPENROUTER_API_KEY"],
  ["Together / Fireworks / Perplexity", "TOGETHER_API_KEY / FIREWORKS_API_KEY / PERPLEXITY_API_KEY"],
  ["Ollama / LM Studio", "OLLAMA_HOST / LMSTUDIO_HOST (no key needed)"],
];

export default function Config() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Use</p>
      <h1 className="text-3xl font-semibold tracking-tight">Configuration</h1>
      <p className="text-muted">Keys resolve in order: <strong className="text-paper">env var → ~/.sentinel.json → project .sentinel.json</strong>. The TUI <code className="font-mono text-[13px] text-paper">/setup</code> dialog writes the file for you. See <code className="font-mono text-[13px] text-paper">.env.example</code>.</p>

      <div className="overflow-x-auto rounded border border-ink-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Provider environment variables</caption>
          <thead>
            <tr className="border-b border-ink-800 text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Provider</th>
              <th scope="col" className="px-4 py-3 font-medium">Env var</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([p, e]) => (
              <tr key={p} className="border-b border-ink-800 last:border-0">
                <th scope="row" className="px-4 py-3 font-normal">{p}</th>
                <td className="px-4 py-3 font-mono text-[13px] text-moss">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pt-4 text-xl font-semibold">Example</h2>
      <CodeBlock label="~/.sentinel.json" language="json" code={'{\n  "provider": "groq",\n  "model": "openai/gpt-oss-20b"\n}'} />
    </>
  );
}
