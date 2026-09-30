/**
 * tui — opencode / MiniMax-style TUI port: theme loading, tool display,
 * markdown parsing, context report, and full-frame render snapshots.
 * Run with: node --import tsx --test __tests__/tui.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOpencodeTheme, ansiToHex, loadOpencodeThemes } from '../src/tui/themes/opencode-loader.ts';
import { THEMES, DEFAULT_THEME, modeColor } from '../src/tui/theme.ts';
import { toolView } from '../src/tui/components/oc/tool-display.ts';
import { parseMarkdown, parseInline } from '../src/tui/components/oc/markdown.tsx';
import { formatContextReport, measureContext, bar } from '../src/tui/lib/context-report.ts';
import { snapshot, snapshotPermission, stripAnsi } from '../scripts/tui-snapshot.tsx';

const THEME_DIR = join(import.meta.dirname, '..', 'src', 'tui', 'themes', 'opencode');

describe('opencode themes', () => {
  it('resolves defs, cross-references, dark/light variants and ANSI indices', () => {
    const t = resolveOpencodeTheme({
      defs: { base: '#112233', alias: 'base' },
      theme: { primary: 'alias', text: { dark: '#ffffff', light: '#000000' }, border: 'primary', info: 4, background: 'none' },
    });
    assert.deepEqual(t, { primary: '#112233', text: '#ffffff', border: '#112233', info: '#000080', background: '' });
    assert.equal(ansiToHex(196), '#ff0000');
    assert.equal(ansiToHex(244), '#808080');
    assert.throws(() => resolveOpencodeTheme({ theme: { a: 'b', b: 'a' } }), /Circular/);
  });

  it('loads every bundled opencode theme without errors', () => {
    const files = readdirSync(THEME_DIR).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 30);
    assert.equal(loadOpencodeThemes().length, files.length);
    assert.match(readFileSync(join(THEME_DIR, 'LICENSE'), 'utf8'), /MIT License/);
  });

  it('every theme exposes a complete, hex palette; OpenCode is the default', () => {
    assert.equal(DEFAULT_THEME.name, 'OpenCode');
    const names = new Set();
    for (const t of THEMES) {
      assert.ok(!names.has(t.name), `duplicate theme name ${t.name}`);
      names.add(t.name);
      for (const key of ['text', 'textMuted', 'primary', 'secondary', 'accent', 'backgroundPanel', 'backgroundElement', 'border', 'error']) {
        assert.match(t.colors[key], /^#[0-9a-fA-F]{6}$/, `${t.name}.${key} = ${t.colors[key]}`);
      }
    }
    assert.equal(modeColor(DEFAULT_THEME.colors, 'BUILD'), DEFAULT_THEME.colors.secondary);
    assert.equal(modeColor(DEFAULT_THEME.colors, 'PLAN'), DEFAULT_THEME.colors.accent);
  });
});

describe('tool display (opencode per-tool renderers)', () => {
  it('maps tools to opencode icons and labels', () => {
    assert.deepEqual(toolView('readFile', { path: 'a.ts' }), { kind: 'inline', icon: '→', pending: 'Reading file…', label: 'Read a.ts' });
    assert.equal(toolView('grep', { pattern: 'x', path: 'src' }).label, 'Grep "x" in src');
    assert.equal(toolView('editFile', { path: 'b.ts' }).icon, '←');
    assert.equal(toolView('searchWeb', { query: 'q' }).icon, '◈');
    assert.equal(toolView('spawnTeammate', { name: 'scout', prompt: 'p', isolation: 'worktree' }).label, 'Teammate scout (worktree) · p');
    assert.equal(toolView('mystery', { a: 1 }).icon, '⚙');
  });

  it('renders shell as a block with the command and output tail', () => {
    const v = toolView('bash', { command: 'npm test' }, { stdout: Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n'), exitCode: 1 }, 5);
    assert.equal(v.kind, 'block');
    assert.equal(v.title, '# Shell · exit 1');
    assert.equal(v.body[0], '$ npm test');
    assert.equal(v.body.at(-1), 'l29');
    assert.match(v.body[1], /25 earlier line/);
  });

  it('renders todos as a checklist block', () => {
    const v = toolView('todoWrite', { todos: [{ id: '1', title: 'a', status: 'completed' }, { id: '2', title: 'b', status: 'in_progress' }] });
    assert.deepEqual(v.body, ['[✓] a', '[•] b']);
  });
});

describe('markdown', () => {
  it('parses blocks, including an unclosed (streaming) fence', () => {
    const b = parseMarkdown('# T\n\n- one\n1. two\n> q\n---\n```js\nx()\n');
    assert.deepEqual(b.map((x) => x.type), ['h', 'blank', 'li', 'li', 'quote', 'hr', 'code']);
    assert.deepEqual(b.at(-1), { type: 'code', lang: 'js', lines: ['x()'] });
  });

  it('parses inline code, strong, emphasis and links', () => {
    assert.deepEqual(parseInline('a `b` **c** *d* [e](http://x)').map((s) => s.kind), ['plain', 'code', 'plain', 'strong', 'plain', 'emph', 'plain', 'link']);
  });
});

describe('/context report (MiniMax capacity meter)', () => {
  it('buckets tokens and draws the meter', () => {
    const msgs = [
      { role: 'user', parts: [{ type: 'text', text: 'x'.repeat(380) }] },
      { role: 'assistant', parts: [{ type: 'tool-call', toolName: 'readFile', input: { path: 'a' }, output: 'y'.repeat(3800) }] },
    ];
    const m = measureContext(msgs);
    assert.equal(m.buckets.user, 100);
    assert.ok(m.byTool.readFile > 1000);
    assert.equal(bar(0.5, 4), '[██░░]');
    const report = formatContextReport(msgs, 2000);
    assert.match(report, /## Context/);
    assert.match(report, /Heaviest tools/);
  });
});

describe('permission prompt (opencode style)', () => {
  it('shows the edit as a mini diff with allow once / always / reject', () => {
    const out = stripAnsi(snapshotPermission('editFile', { path: 'src/a.js', oldString: 'let x = 1;', newString: 'const x = 2;' }));
    assert.match(out, /△ Permission required/);
    assert.match(out, /← Edit src\/a\.js/);
    assert.match(out, /- let x = 1;/);
    assert.match(out, /\+ const x = 2;/);
    assert.match(out, /Allow once .* Allow always .* Reject/);
  });

  it('shows shell commands with their risk explanation', () => {
    const out = stripAnsi(snapshotPermission('bash', { command: 'npm publish', __risk: 'High risk.\npublishes a package' }));
    assert.match(out, /\$ npm publish/);
    assert.match(out, /High risk\./);
  });
});

describe('render snapshot', () => {
  it('session frame has the opencode layout', async () => {
    const out = stripAnsi(await snapshot('OpenCode'));
    assert.match(out, /┃ {2}fix the failing date parser test/);
    assert.match(out, / {3}✱ Grep "parseDate" in src/);
    assert.match(out, / {3}→ Read src\/parse\.ts/);
    assert.match(out, /┃ {2}# Run parser tests/);
    assert.match(out, /┃ {2}\$ npm test -- parse/);
    assert.match(out, /▣ Build · openai\/gpt-oss-20b · 8\.4s/);
    assert.match(out, /STEER/);
    assert.match(out, /Todos 1\/3/);
    assert.match(out, /Working · 4\.2s/);
    assert.match(out, /enter steer · esc stop/);
    assert.match(out, /Build · openai\/gpt-oss-20b groq/);
    assert.match(out, /\[████░░░░░░\] 42%/);
  });

  it('home frame shows the logo and a tip', async () => {
    const out = stripAnsi(await snapshot('OpenCode', { home: true }));
    assert.match(out, /█▀▀▀ █▀▀▀ █▀▀▄/);
    assert.match(out, /Tip: /);
  });

  it('renders under every theme without throwing', async () => {
    for (const t of THEMES) {
      const out = await snapshot(t.name);
      assert.ok(out.length > 200, t.name);
    }
  });
});
