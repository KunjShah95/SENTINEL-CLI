/**
 * Render the TUI chrome with fixture messages into a string (no TTY, no
 * model). `npx tsx scripts/tui-snapshot.tsx [themeName] [--ansi]`
 * Used to eyeball layout changes and in __tests__/tui-snapshot.test.js.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'ink';
import { ThemeProvider } from '../src/tui/providers/theme/index.js';
import { DialogProvider } from '../src/tui/providers/dialog/index.js';
import { PermissionDialog } from '../src/tui/components/dialogs/permission-dialog.js';
import { UserMessage, BotMessage, ErrorMessage } from '../src/tui/components/messages/index.js';
import { Home, ActivityLine, Footer, TodoPanel } from '../src/tui/components/oc/chrome.js';
import { InputBar } from '../src/tui/components/input-bar.js';
import { Box } from 'ink';

export const FIXTURE_PARTS = [
  { type: 'reasoning', text: 'The user wants the failing date test fixed. Look at parse.ts first.' },
  { type: 'tool-call', toolName: 'grep', input: { pattern: 'parseDate', path: 'src' }, state: 'output-available', output: {} },
  { type: 'tool-call', toolName: 'readFile', input: { path: 'src/parse.ts' }, state: 'output-available', output: {} },
  { type: 'tool-call', toolName: 'editFile', input: { path: 'src/parse.ts' }, state: 'output-available', output: {} },
  { type: 'tool-call', toolName: 'bash', input: { command: 'npm test -- parse', description: 'Run parser tests' }, state: 'output-available', output: { stdout: 'PASS src/parse.test.ts\nTests: 12 passed, 12 total', exitCode: 0 } },
  { type: 'tool-call', toolName: 'writeFile', input: { path: '.env' }, state: 'output-error', errorText: 'Refusing to write secrets file: .env' },
  { type: 'text', text: 'Fixed the **timezone** bug in `parseDate`:\n\n- normalize to UTC before comparing\n- added a regression test\n\n```ts\nreturn new Date(Date.UTC(y, m - 1, d));\n```' },
];

/** One source of truth for the version, so the fixture cannot drift from it. */
const VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

export async function snapshot(themeName?: string, { home = false, columns = 100 } = {}): Promise<string> {
  const App = () => {
    return (
      <Box flexDirection="column" width={100}>
        {home ? <Home version={VERSION} /> : (
          <>
            <UserMessage message="fix the failing date parser test" mode="BUILD" />
            <BotMessage parts={FIXTURE_PARTS as any} model="groq/openai/gpt-oss-20b" mode="BUILD" duration={8400} done />
            <UserMessage message="↪ also update the changelog" mode="BUILD" />
            <ErrorMessage message="Provider HTTP 401: Invalid API Key" />
            <TodoPanel todos={[{ id: '1', title: 'Fix parseDate', status: 'completed' }, { id: '2', title: 'Update changelog', status: 'in_progress' }, { id: '3', title: 'Run full suite', status: 'pending' }]} />
            <ActivityLine phase="running" startedAt={Date.now() - 4200} outputChars={2400} />
          </>
        )}
        <InputBar onSubmit={() => {}} model="groq/openai/gpt-oss-20b" mode="BUILD" />
        <Footer contextRatio={0.42} costUsd={0.0031} teammates={2} background={1} scroll={3} model="groq/openai/gpt-oss-20b" />
      </Box>
    );
  };
  return renderToString(
    <ThemeProvider initialTheme={themeName}><App /></ThemeProvider>,
    { columns },
  );
}

/** Render the permission prompt for one tool call. */
export function snapshotPermission(toolName: string, input: unknown, themeName = 'OpenCode'): string {
  return renderToString(
    <ThemeProvider initialTheme={themeName}>
      <DialogProvider>
        <PermissionDialog request={{ toolName, toolCallId: 't1', input }} onResult={() => {}} />
      </DialogProvider>
    </ThemeProvider>,
    { columns: 84 },
  );
}

export const stripAnsi =(s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

if (process.argv[1] && process.argv[1].includes('tui-snapshot')) {
  const args = process.argv.slice(2);
  const ansi = args.includes('--ansi');
  const home = args.includes('--home');
  const theme = args.find((a) => !a.startsWith('--'));
  snapshot(theme, { home }).then((out) => {
    process.stdout.write((ansi ? out : stripAnsi(out)) + '\n');
    process.exit(0);
  });
}
