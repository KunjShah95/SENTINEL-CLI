import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "TUI commands",
  description:
    "Every Sentinel slash command (model, session, diff, undo, redo, export, compact), plus shell passthrough with ! and agent personas with @agent.",
  path: "/docs/tui",
  keywords: ["terminal ui commands", "cli slash commands", "sentinel tui"],
});

const commands: { cmd: string; body: string }[] = [
  { cmd: "/help", body: "Show all commands." },
  { cmd: "/model [id]", body: "Switch model. No arg opens the picker." },
  { cmd: "/models", body: "List registry + live-discovered models." },
  { cmd: "/session [list|switch|delete]", body: "Manage JSON sessions on disk." },
  { cmd: "/commit", body: "Commit pending changes." },
  { cmd: "/diff", body: "Show working-tree diff." },
  { cmd: "/undo · /redo", body: "Step through write checkpoints." },
  { cmd: "/export", body: "Export the session transcript." },
  { cmd: "/health", body: "Provider keys, models, connectivity." },
  { cmd: "/compact", body: "Summarize and trim context under budget." },
  { cmd: "/setup", body: "Write config file interactively." },
  { cmd: "/editor", body: "Open $EDITOR for long prompts." },
  { cmd: "/thinking · /details", body: "Toggle reasoning and tool detail rows." },
  { cmd: "/clear · /new", body: "Clear view or start a fresh session." },
];

export default function Tui() {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wide text-moss">Docs · Use</p>
      <h1 className="text-3xl font-semibold tracking-tight">TUI commands</h1>
      <p className="text-muted">The Ink (React) terminal UI. Plus <code className="font-mono text-[13px] text-paper">! &lt;cmd&gt;</code> for shell passthrough and <code className="font-mono text-[13px] text-paper">@agent &lt;msg&gt;</code> for personas. <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-xs">Ctrl+X</kbd> opens the leader-key menu; <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-xs">Ctrl+S</kbd> toggles the session panel.</p>
      <ul className="grid gap-3 pt-2 sm:grid-cols-2">
        {commands.map((c) => (
          <li key={c.cmd} className="rounded border border-ink-800 bg-ink-900 p-4">
            <p className="font-mono text-sm text-paper">{c.cmd}</p>
            <p className="mt-1 text-sm text-muted">{c.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
