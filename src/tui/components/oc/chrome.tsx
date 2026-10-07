/**
 * Session chrome, matched to the two CLIs this TUI copies:
 *   Home         — MiniMax shell/welcome: ANSI-shadow wordmark, rounded frame,
 *                  "Tips for getting started" and "What's new".
 *   ActivityLine — MiniMax shell/activity-line.ts: spinner, phase, elapsed
 *                  (after 1.5s), tok/s, then `enter steer · esc stop`.
 *   TodoPanel    — MiniMax shell/todo-panel.ts: ✓ / ● / ○ rows and a
 *                  "n/m done · p pending" summary.
 *   Footer       — opencode session footer: directory left, status right,
 *                  with MiniMax's context meter and model.
 *   Composer     — lives in input-bar.tsx (MiniMax box + opencode meta row).
 */
import React, { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { useTheme } from "../../providers/theme/index.js";
import { CapacityBar, formatDuration, shortModelName } from "./primitives.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ELAPSED_REVEAL_AFTER_MS = 1_500;

export type ActivityPhase = "idle" | "running" | "waiting" | "compacting" | "stopping";

const PHASE_LABEL: Record<ActivityPhase, string> = {
  idle: "",
  running: "Running",
  waiting: "Waiting",
  compacting: "Compacting context",
  stopping: "Stopping response",
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
  const tone = phase === "stopping" ? colors.error : colors.primary;
  return (
    <Box paddingLeft={2} width="100%">
      <Text>
        <Text color={tone} bold>{FRAMES[frame]} </Text>
        <Text color={tone} bold>{PHASE_LABEL[phase]}</Text>
        {elapsed >= ELAPSED_REVEAL_AFTER_MS ? <Text color={colors.textMuted}>{` ${formatDuration(elapsed)}`}</Text> : null}
        {tps > 0 ? <Text color={colors.secondary}>{` · ⚡ ~${tps} tok/s`}</Text> : null}
        <Text color={colors.textMuted}>{" · enter steer · esc stop"}</Text>
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

function todoMarker(status: string): { mark: string; tone: "done" | "active" | "pending" | "skip" } {
  if (status === "completed" || status === "done") return { mark: "✓", tone: "done" };
  if (status === "in_progress") return { mark: "●", tone: "active" };
  if (status === "cancelled") return { mark: "–", tone: "skip" };
  return { mark: "○", tone: "pending" };
}

/** MiniMax compact todo list: marker rows, then "n/m done · p pending". */
export function TodoPanel({ todos, max = 3 }: { todos: Todo[]; max?: number }) {
  const { colors } = useTheme();
  if (!todos.length) return null;
  const done = todos.filter((t) => t.status === "completed" || t.status === "done").length;
  if (done === todos.length) {
    return (
      <Box paddingLeft={2} marginTop={1}>
        <Text color={colors.success}>{`✓ Todo list ${done}/${todos.length} completed`}</Text>
      </Box>
    );
  }
  const pending = todos.filter((t) => t.status === "pending" || !t.status).length;
  const active = todos.filter((t) => t.status === "in_progress");
  const rest = todos.filter((t) => t.status !== "in_progress");
  const shown = active.concat(rest).slice(0, max);
  const hidden = todos.length - shown.length;
  return (
    <Box flexDirection="column" paddingLeft={2} marginTop={1}>
      {shown.map((t) => {
        const { mark, tone } = todoMarker(t.status);
        const color = tone === "active" ? colors.primary : tone === "pending" ? colors.text : colors.textMuted;
        return (
          <Text key={t.id} wrap="truncate-end">
            <Text color={tone === "done" ? colors.success : tone === "active" ? colors.primary : colors.textMuted}>{mark}</Text>
            <Text
              color={color}
              strikethrough={tone === "done" || tone === "skip"}
              bold={tone === "active"}
            >
              {` ${t.title}`}
            </Text>
          </Text>
        );
      })}
      <Text color={colors.textMuted}>
        {hidden > 0 ? `… +${hidden} more · ` : ""}
        {`${done}/${todos.length} done · ${pending} pending`}
      </Text>
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

/** "~/a/very/long/path" → "~/a/ve…/path" within `max` columns. */
export function middleEllipsis(s: string, max: number): string {
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.35);
  return `${s.slice(0, head)}…${s.slice(s.length - (keep - head))}`;
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
  scroll = 0,
  model,
}: {
  contextRatio?: number;
  costUsd?: number;
  teammates?: number;
  background?: number;
  microSaved?: number;
  /** Lines the transcript is scrolled up from the live edge. */
  scroll?: number;
  model?: string;
}) {
  const { colors } = useTheme();
  const dir = useDirectoryLabel();
  const { stdout } = useStdout();
  const columns = stdout?.columns || 100;
  const { name: modelName } = shortModelName(model);
  const right = [
    teammates > 0 ? `◆ ${teammates} teammate${teammates > 1 ? "s" : ""}` : "",
    background > 0 ? `& ${background} bg` : "",
    modelName,
    microSaved > 0 ? `⌫ ${(microSaved / 1000).toFixed(1)}k` : "",
    costUsd ? `$${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}` : "",
    "ctrl+p",
  ].filter(Boolean).join("  ");
  const dirWidth = Math.max(16, Math.floor(columns * 0.34));
  return (
    <Box flexDirection="row" paddingLeft={1} paddingRight={1} flexShrink={0} width="100%">
      <Box width={dirWidth} flexShrink={0} marginRight={1}>
        <Text color={colors.textMuted} wrap="truncate-end">{middleEllipsis(dir, dirWidth)}</Text>
      </Box>
      {scroll > 0 ? (
        // Its own Box, outside the truncating cluster.
        //
        // `truncate-start` elides from the LEFT, so an indicator sitting inside
        // that cluster is the first thing cut on a narrow terminal. That is the
        // worst possible element to lose: it is the only thing telling you the
        // transcript is parked above the live edge, and without it a parked view
        // is indistinguishable from a stalled one. Everything to its right (model,
        // cost, token bar) degrades gracefully when clipped; this does not.
        <Box flexShrink={0} marginRight={1}>
          <Text color={colors.warning}>{`⇅ ${scroll}↑`}</Text>
        </Box>
      ) : null}
      <Box flexGrow={1} justifyContent="flex-end" minWidth={0}>
        <Text wrap="truncate-start" color={colors.textMuted}>
          {right}
          {contextRatio !== undefined ? (
            <Text color={colors.textMuted}>
              {"  "}
              <CapacityBar ratio={contextRatio} width={10} />
              {` ${Math.round(contextRatio * 100)}%`}
            </Text>
          ) : null}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * ANSI Shadow "SENTINEL", the same face MiniMax Code uses for its wordmark.
 * Lines are equal width so the gradient rows stay aligned.
 */
export const WORDMARK = [
  "███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗     ",
  "██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║     ",
  "███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║     ",
  "╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║     ",
  "███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███████╗",
  "╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝",
];

const WELCOME_TIPS = [
  "Say what you want and how to verify it.",
  "Use @ for files and / for commands.",
  "/goal keeps long-running work on a finish line.",
];

const WELCOME_NEWS = [
  "Type while a turn runs to steer it.",
  "/context shows the current context budget.",
  "/fork branches this conversation.",
];

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
  const { stdout } = useStdout();
  const columns = stdout?.columns || 100;
  const gradient = [colors.secondary, colors.secondary, colors.primary, colors.primary, colors.textMuted, colors.textMuted];
  if (columns < WORDMARK[0].length + 4) {
    return <Text bold color={colors.primary}>SENTINEL</Text>;
  }
  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      {WORDMARK.map((line, i) => (
        <Text key={i} bold color={gradient[i]}>{line}</Text>
      ))}
    </Box>
  );
}

/** MiniMax welcome frame: version, tips, and a short what's-new list. */
export function WelcomeFrame({ version }: { version?: string }) {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.border} paddingX={1} width="100%">
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={colors.textMuted}>{version ? `v${version}` : "sentinel"}</Text>
        <Text color={colors.success}>● Ready</Text>
      </Box>
      <Box marginTop={1}>
        <Text bold color={colors.primary}>Tips for getting started</Text>
      </Box>
      {WELCOME_TIPS.map((tip) => (
        <Text key={tip}>
          <Text bold color={colors.secondary}>› </Text>
          <Text color={colors.text}>{tip}</Text>
        </Text>
      ))}
      <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={colors.border} />
      <Text bold color={colors.primary}>{"What's new"}</Text>
      {WELCOME_NEWS.map((item) => (
        <Text key={item}>
          <Text bold color={colors.secondary}>› </Text>
          <Text color={colors.text}>{item}</Text>
        </Text>
      ))}
    </Box>
  );
}

export function Home({ version }: { version?: string }) {
  return (
    <Box flexDirection="column" width="100%" paddingY={1} alignItems="center">
      <Logo />
      <Box marginTop={1} width="100%">
        <WelcomeFrame version={version} />
      </Box>
    </Box>
  );
}

/** Composer tip, rotated on the same 30s buckets MiniMax uses. */
export function composerTip(now = Date.now()): string {
  const bucket = Math.floor(now / 30_000);
  return `Tip: ${TIPS[((bucket % TIPS.length) + TIPS.length) % TIPS.length]}`;
}
