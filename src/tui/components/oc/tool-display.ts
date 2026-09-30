/**
 * How each Sentinel tool call renders, following opencode's per-tool
 * renderers (routes/session/index.tsx: Shell "$", Read "→", Write/Edit "←",
 * Glob/Grep "✱", WebSearch "◈", Patch "%", Todo/generic "⚙", Task "│").
 * Pure so it can be unit-tested without Ink.
 */
export type ToolView =
  | { kind: "inline"; icon: string; pending: string; label: string }
  | { kind: "block"; title: string; icon: string; pending: string; label: string; body: string[] };

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const q = (v: unknown) => `"${s(v)}"`;
const lines = (text: string, max: number) => {
  const all = text.replace(/\r/g, "").split("\n");
  while (all.length && !all[all.length - 1].trim()) all.pop();
  if (all.length <= max) return all;
  return [`… ${all.length - max} earlier line(s)`, ...all.slice(-max)];
};

function outputText(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output;
  const o = output as Record<string, unknown>;
  if (typeof o.stdout === "string" || typeof o.stderr === "string") {
    return [s(o.stdout), s(o.stderr)].filter((x) => x.trim()).join("\n");
  }
  if (typeof o.output === "string") return o.output;
  if (typeof o.summary === "string") return o.summary;
  if (typeof o.rendered === "string") return o.rendered;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

export function toolView(name: string, input: unknown, output?: unknown, maxLines = 10): ToolView {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
  case "bash":
  case "runTests": {
    const cmd = s(i.command);
    const out = outputText(output);
    const exit = (output as { exitCode?: number } | undefined)?.exitCode;
    const tests = name === "runTests" && output && typeof output === "object"
      ? (() => {
        const o = output as { passed?: unknown[]; failed?: unknown[] };
        return `${o.passed?.length ?? 0} passed · ${o.failed?.length ?? 0} failed`;
      })()
      : "";
    const title = `# ${s(i.description) || (name === "runTests" ? "Run tests" : "Shell")}${typeof exit === "number" && exit !== 0 ? ` · exit ${exit}` : ""}${tests ? ` · ${tests}` : ""}`;
    return { kind: "block", title, icon: "$", pending: "Writing command…", label: cmd, body: [`$ ${cmd}`, ...(out ? lines(out, maxLines) : [])] };
  }
  case "readFile": return { kind: "inline", icon: "→", pending: "Reading file…", label: `Read ${s(i.path)}` };
  case "listDirectory": return { kind: "inline", icon: "→", pending: "Listing…", label: `List ${s(i.path) || "."}` };
  case "glob": return { kind: "inline", icon: "✱", pending: "Finding files…", label: `Glob ${q(i.pattern)}` };
  case "grep": return { kind: "inline", icon: "✱", pending: "Searching content…", label: `Grep ${q(i.pattern)}${i.path ? ` in ${s(i.path)}` : ""}` };
  case "codeMap": return { kind: "inline", icon: "✱", pending: "Mapping symbols…", label: `Code map ${s(i.path) || "."}` };
  case "searchWeb": return { kind: "inline", icon: "◈", pending: "Searching web…", label: `Web search ${q(i.query)}` };
  case "writeFile": return { kind: "inline", icon: "←", pending: "Preparing write…", label: `Write ${s(i.path)}` };
  case "editFile": return { kind: "inline", icon: "←", pending: "Preparing edit…", label: `Edit ${s(i.path)}` };
  case "batchEdit": {
    const ops = Array.isArray(i.operations) ? i.operations : [];
    const files = [...new Set(ops.map((o: any) => s(o?.filePath)))];
    return { kind: "inline", icon: "←", pending: "Preparing edits…", label: `Edit ${files.length} file(s): ${files.slice(0, 3).join(", ")}` };
  }
  case "applyPatch": {
    const files = [...s(i.patch).matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
    return { kind: "inline", icon: "%", pending: "Preparing patch…", label: `Patch ${files.join(", ") || "(unknown files)"}` };
  }
  case "diffFile": return { kind: "inline", icon: "%", pending: "Diffing…", label: `Diff ${s(i.path)}` };
  case "undoLastChange": return { kind: "inline", icon: "↶", pending: "Undoing…", label: "Undo last change" };
  case "redoLastUndo": return { kind: "inline", icon: "↷", pending: "Redoing…", label: "Redo" };
  case "todoWrite": {
    const todos = Array.isArray(i.todos) ? i.todos : [];
    const mark = (st: string) => (st === "completed" || st === "done" ? "[✓]" : st === "in_progress" ? "[•]" : "[ ]");
    return { kind: "block", title: "# Todos", icon: "⚙", pending: "Updating todos…", label: "Todos", body: todos.map((t: any) => `${mark(s(t?.status))} ${s(t?.title)}`) };
  }
  case "todoRead": return { kind: "inline", icon: "⚙", pending: "Reading todos…", label: "Read todos" };
  case "skill": return { kind: "inline", icon: "→", pending: "Loading skill…", label: `Skill ${s(i.name)}` };
  case "spawnAgent": return { kind: "inline", icon: "│", pending: "Delegating…", label: `Task ${s(i.mode) || "PLAN"} · ${s(i.prompt).slice(0, 60)}` };
  case "memoryWrite": return { kind: "inline", icon: "⚙", pending: "Saving memory…", label: `Memory ${s(i.name)} (${s(i.type)})` };
  case "memoryDelete": return { kind: "inline", icon: "⚙", pending: "Deleting memory…", label: `Forget ${s(i.name)}` };
  case "bgRun": return { kind: "inline", icon: "&", pending: "Starting…", label: `Background ${s(i.command)}` };
  case "bgCheck": return { kind: "inline", icon: "&", pending: "Checking…", label: `Background status${i.id ? ` ${s(i.id)}` : ""}` };
  case "spawnTeammate": return { kind: "inline", icon: "◆", pending: "Spawning teammate…", label: `Teammate ${s(i.name)}${i.isolation === "worktree" ? " (worktree)" : ""} · ${s(i.prompt).slice(0, 50)}` };
  case "sendMessage": return { kind: "inline", icon: "✉", pending: "Sending…", label: `Message → ${s(i.to)}` };
  case "teamStatus": return { kind: "inline", icon: "◆", pending: "Checking team…", label: "Team status" };
  case "teamMerge": return { kind: "inline", icon: "%", pending: "Merging…", label: `Merge ${s(i.name)} (${s(i.action) || "apply"})` };
  default: {
    let args = "";
    try { args = JSON.stringify(input ?? {}); } catch { args = ""; }
    return { kind: "inline", icon: "⚙", pending: `${name}…`, label: `${name} ${args.length > 80 ? `${args.slice(0, 80)}…` : args}` };
  }
  }
}
