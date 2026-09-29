/**
 * Session chrome:
 *   ActivityLine — MiniMax Code shell/activity-line.ts: spinner · phase ·
 *                  elapsed (revealed after 1.5s) · output tok/s · controls.
 *   TodoPanel    — MiniMax Code shell/todo-panel.ts: live task list above
 *                  the prompt while the agent works.
 *   Footer       — opencode routes/session/footer.tsx: directory left,
 *                  status items right, plus a MiniMax capacity meter.
 *   Home         — opencode routes/home.tsx: centered two-tone logo, prompt,
 *                  and a rotating tip line (MiniMax shell/tips.ts).
 */
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { useTheme } from "../../providers/theme/index.js";
import { CapacityBar, formatDuration } from "./primitives.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ELAPSED_REVEAL_AFTER_MS = 1_500;

export type ActivityPhase = "idle" | "running" | "waiting" | "compacting" | "stopping";

const PHASE_LABEL: Record<ActivityPhase, string> = {
  idle: "",
  running: "Working",
  waiting: "Waiting for background work",
  compacting: "Compacting context",
  stopping: "Stopping",
};

export function ActivityLine({
  phase,
  startedAt,
  outputChars = 0,
}: {
  phase: ActivityPhase;
  startedAt?: number;
  outputChars?: number;
}) {
  const { colors } = useTheme();
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase === "idle") return;
    const t = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
      setNow(Date.now());
    }, 80);
    return () => clearInterval(t);
  }, [phase]);
  if (phase === "idle") return null;
  const elapsed = startedAt ? now - startedAt : 0;
  const secs = elapsed / 1000;
  const tps = secs > 1 && outputChars > 0 ? Math.round(outputChars / 4 / secs) : 0;
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <Text>
        <Text color={colors.primary}>{FRAMES[frame]} </Text>
        <Text color={colors.text}>{PHASE_LABEL[phase]}</Text>
        {elapsed >= ELAPSED_REVEAL_AFTER_MS ? <Text color={colors.textMuted}>{` · ${formatDuration(elapsed)}`}</Text> : null}
        {tps > 0 ? <Text color={colors.textMuted}>{` · ~${tps} tok/s`}</Text> : null}
      </Text>
      <Text color={colors.textMuted}>
        <Text color={colors.text}>enter</Text>{" steer · "}
        <Text color={colors.text}>esc</Text>{" stop"}
      </Text>
    </Box>
  );
}

type Todo = { id: string; title: string; status: string };

export function useTodos(active: boolean): Todo[] {
  const [todos, setTodos] = useState<Todo[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { readTodos } = await import("../../../agent/tasks.js");
        const list = readTodos() as Todo[];
        if (!cancelled) setTodos(Array.isArray(list) ? list : []);
      } catch { /* no todos file */ }
    };
    load();
    if (!active) return () => { cancelled = true; };
    const t = setInterval(load, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [active]);
  return todos;
}

export function TodoPanel({ todos, max = 6 }: { todos: Todo[]; max?: number }) {
  const { colors } = useTheme();
  const open = todos.filter((t) => t.status !== "completed" && t.status !== "done" && t.status !== "cancelled");
  if (!todos.length || !open.length) return null;
  const done = todos.length - open.length;
  const shown = todos.filter((t) => t.status === "in_progress").concat(open.filter((t) => t.status !== "in_progress")).slice(0, max);
  return (
    <Box flexDirection="column" paddingLeft={1} marginTop={1}>
      <Text color={colors.textMuted}>
        {"Todos "}<Text color={colors.text}>{`${done}/${todos.length}`}</Text>
      </Text>
      {shown.map((t) => (
        <Text key={t.id} color={t.status === "in_progress" ? colors.warning : colors.textMuted} wrap="truncate-end">
          {t.status === "in_progress" ? "[•] " : "[ ] "}{t.title}
        </Text>
      ))}
      {open.length > max ? <Text color={colors.textMuted}>{`  … ${open.length - max} more`}</Text> : null}
    </Box>
  );
}

/** "~/path/to/project:branch" (opencode footer directory). */
export function directoryLabel(cwd = process.cwd(), home = os.homedir()): string {
  let dir = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  dir = dir.replace(/\\/g, "/");
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (branch) dir += `:${branch}`;
  } catch { /* not a repo */ }
  return dir;
}

function useDirectoryLabel(): string {
  // Computed once, synchronously, so the very first frame has it.
  const [label] = useState(() => directoryLabel());
  return label;
}

export function Footer({
  contextRatio,
  costUsd,
  teammates = 0,
  background = 0,
  microSaved = 0,
}: {
  contextRatio?: number;
  costUsd?: number;
  teammates?: number;
  background?: number;
  microSaved?: number;
}) {
  const { colors } = useTheme();
  const dir = useDirectoryLabel();
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1} flexShrink={0}>
      <Text color={colors.textMuted} wrap="truncate-middle">{dir}</Text>
      <Box flexDirection="row" gap={2} flexShrink={0}>
        {teammates > 0 ? <Text color={colors.text}><Text color={colors.accent}>◆</Text>{` ${teammates} teammate${teammates > 1 ? "s" : ""}`}</Text> : null}
        {background > 0 ? <Text color={colors.text}><Text color={colors.warning}>&</Text>{` ${background} bg`}</Text> : null}
        {microSaved > 0 ? <Text color={colors.textMuted}>{`⌫ ${(microSaved / 1000).toFixed(1)}k`}</Text> : null}
        {contextRatio !== undefined ? (
          <Text color={colors.textMuted}>
            <CapacityBar ratio={contextRatio} width={10} />{` ${Math.round(contextRatio * 100)}%`}
          </Text>
        ) : null}
        {costUsd ? <Text color={colors.textMuted}>{`$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`}</Text> : null}
        <Text color={colors.textMuted}>ctrl+p</Text>
      </Box>
    </Box>
  );
}

/** Two-tone block logo in opencode's style (left muted, right bright). */
export const LOGO = {
  left: [
    "█▀▀▀ █▀▀▀ █▀▀▄ ▀█▀",
    "▀▀▀█ █▀▀  █  █  █ ",
    "▀▀▀▀ ▀▀▀▀ ▀  ▀  ▀ ",
  ],
  right: [
    "█ █▀▀▄ █▀▀▀ █   ",
    "█ █  █ █▀▀  █   ",
    "▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀",
  ],
};

export const TIPS = [
  "/goal keeps multi-step work focused on a finish line",
  "type while a turn runs to steer it without interrupting",
  "/fork branches the current conversation",
  "sentinel race runs N agents and keeps the one that passes your tests",
  "ask for a team: teammates work in parallel git worktrees",
  "/sessions resumes earlier conversations",
  "tab switches Build and Plan",
  "/theme picks from 40+ themes (all of opencode's included)",
  "/context shows the current context budget",
  "put reusable prompts in .sentinel/prompts/<name>.md and run /<name>",
];

export function Tip() {
  const { colors } = useTheme();
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % TIPS.length), 8000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text color={colors.textMuted}>
      <Text color={colors.warning}>● </Text>{"Tip: "}<Text color={colors.text}>{TIPS[i]}</Text>
    </Text>
  );
}

export function Logo() {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column">
      {LOGO.left.map((l, i) => (
        <Text key={i}>
          <Text color={colors.textMuted}>{l}</Text>
          <Text color={colors.text} bold>{` ${LOGO.right[i]}`}</Text>
        </Text>
      ))}
    </Box>
  );
}

export function Home({ version }: { version?: string }) {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" alignItems="center" flexGrow={1} justifyContent="center" paddingY={2}>
      <Logo />
      <Box marginTop={1}>
        <Text color={colors.textMuted}>{`the minimal coding agent${version ? ` · v${version}` : ""}`}</Text>
      </Box>
      <Box marginTop={2}><Tip /></Box>
    </Box>
  );
}
