/**
 * Prompt templates (ported from pi-mono coding-agent
 * core/prompt-templates.ts): reusable prompts as Markdown files, invoked as
 * `/name arg1 "arg two"`.
 *
 * Lookup: <project>/.sentinel/prompts/*.md, then ~/.sentinel/prompts/*.md
 * (project wins). Optional frontmatter `description:`; otherwise the first
 * non-empty line describes it. Arguments use bash-style placeholders.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import os from 'node:os';

export function parseCommandArgs(argsString = '') {
  const args = [];
  let cur = '';
  let quote = null;
  for (const ch of argsString) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === '\'') {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { args.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) args.push(cur);
  return args;
}

/**
 * $1..$N, $@ / $ARGUMENTS, ${N:-default}, ${@:-default}, ${@:N}, ${@:N:L}.
 * Substitution is single-pass: argument values are never re-expanded.
 */
export function substituteArgs(content, args) {
  const all = args.join(' ');
  return content.replace(
    /\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_m, defTarget, defValue, sliceStart, sliceLen, simple) => {
      if (defTarget) {
        const v = defTarget === '@' || defTarget === 'ARGUMENTS' ? all : args[parseInt(defTarget, 10) - 1];
        return v || defValue;
      }
      if (sliceStart) {
        const start = Math.max(0, parseInt(sliceStart, 10) - 1);
        return sliceLen ? args.slice(start, start + parseInt(sliceLen, 10)).join(' ') : args.slice(start).join(' ');
      }
      if (simple === '@' || simple === 'ARGUMENTS') return all;
      return args[parseInt(simple, 10) - 1] ?? '';
    },
  );
}

function parseTemplate(file) {
  const raw = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const body = (m ? m[2] : raw).trim();
  let description = m ? (/^description:\s*(.*)$/m.exec(m[1])?.[1] || '').trim() : '';
  if (!description) description = (body.split('\n').find((l) => l.trim()) || '').slice(0, 60);
  return { name: basename(file).replace(/\.md$/, ''), description, content: body, filePath: file };
}

export function promptDirs(cwd = process.cwd()) {
  const home = process.env.SENTINEL_HOME || join(os.homedir(), '.sentinel');
  return [join(cwd, '.sentinel', 'prompts'), join(home, 'prompts')];
}

export function listPromptTemplates(cwd = process.cwd()) {
  const seen = new Map();
  for (const dir of promptDirs(cwd)) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.md')) continue;
      const name = f.slice(0, -3);
      if (seen.has(name)) continue;
      try { seen.set(name, parseTemplate(join(dir, f))); } catch { /* unreadable: skip */ }
    }
  }
  return [...seen.values()];
}

/**
 * Expand `/name args…` when a template matches; otherwise return the text
 * unchanged (so ordinary slash commands and prose pass through).
 */
export function expandPromptTemplate(text, cwd = process.cwd()) {
  const m = /^\/([\w.-]+)(?:\s+([\s\S]*))?$/.exec(String(text || '').trim());
  if (!m) return { text, template: null };
  const tpl = listPromptTemplates(cwd).find((t) => t.name === m[1]);
  if (!tpl) return { text, template: null };
  return { text: substituteArgs(tpl.content, parseCommandArgs(m[2] || '')), template: tpl.name };
}
