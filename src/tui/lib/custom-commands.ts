import fs from 'node:fs/promises';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, processTemplate } from './command-template.js';

const COMMANDS_DIR = path.resolve(process.cwd(), '.sentinel', 'commands');

export type CustomCommand = {
  name: string;
  title: string;
  description: string;
  prompt: string;
  filePath: string;
  metadata: {
    'argument-hint'?: string;
    'allowed-tools'?: string[];
    [key: string]: unknown;
  };
};

let syncCache: CustomCommand[] | null = null;

/**
 * Synchronous version — used in command dispatch where we can't await.
 * Caches after first load so subsequent calls are instant.
 */
export function getCustomCommandSync(name: string): CustomCommand | undefined {
  if (syncCache) return syncCache.find(c => c.name === name.toLowerCase());

  if (!existsSync(COMMANDS_DIR)) {
    syncCache = [];
    return undefined;
  }

  let entries: string[];
  try { entries = readdirSync(COMMANDS_DIR); } catch { syncCache = []; return undefined; }

  const cmds: CustomCommand[] = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    try {
      const filePath = path.join(COMMANDS_DIR, file);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseCommandFile(file, content);
      if (parsed) cmds.push(parsed);
    } catch { /* skip */ }
  }

  syncCache = cmds;
  return cmds.find(c => c.name === name.toLowerCase());
}

export function listCustomCommandNames(): string[] {
  if (!syncCache) getCustomCommandSync('');
  return syncCache?.map(c => c.name) ?? [];
}

export function invalidateCustomCommandsCache() { syncCache = null; }

export async function loadCustomCommands(): Promise<CustomCommand[]> {
  if (syncCache) return syncCache;

  if (!existsSync(COMMANDS_DIR)) {
    syncCache = [];
    return syncCache;
  }

  const entries = await fs.readdir(COMMANDS_DIR);
  const mdFiles = entries.filter(e => e.endsWith('.md')).sort();

  const commands: CustomCommand[] = [];

  for (const file of mdFiles) {
    try {
      const filePath = path.join(COMMANDS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = parseCommandFile(file, content);
      if (parsed) commands.push(parsed);
    } catch { /* skip malformed */ }
  }

  syncCache = commands;
  return commands;
}

/**
 * Execute a custom command with full template processing.
 *
 * @param {string} name — command name
 * @param {string} argString — arguments after the command
 * @param {object} context — { mode, model }
 * @returns {string | null} — processed prompt or null if not found
 */
export function executeCustomCommand(
  name: string,
  argString: string,
  context: { mode?: string; model?: string } = {}
): string | null {
  const cmd = getCustomCommandSync(name);
  if (!cmd) return null;

  return processTemplate(cmd.prompt, {
    arguments: argString,
    mode: context.mode || 'BUILD',
    model: context.model || '',
    allowShell: true,
    allowFileRefs: true,
  });
}

function parseCommandFile(filename: string, content: string): CustomCommand | null {
  const name = filename.replace(/\.md$/i, '').toLowerCase();
  if (!name) return null;

  // Try YAML frontmatter first (new format)
  const { metadata, body } = parseFrontmatter(content);

  if (body) {
    // New format with frontmatter
    const title = (metadata.title as string) || extractTitle(body) || name;
    const description = (metadata.description as string) || extractDescription(body) || '';

    return {
      name,
      title,
      description,
      prompt: body,
      filePath: path.join(COMMANDS_DIR, filename),
      metadata: metadata as CustomCommand['metadata'],
    };
  }

  // Legacy format: # Title, > description, rest is prompt
  const lines = content.split('\n');
  let title = name;
  let description = '';
  let promptStart = 0;

  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    promptStart = 1;
  }

  const descLines: string[] = [];
  let i = promptStart;
  while (i < lines.length && lines[i]?.startsWith('>')) {
    descLines.push(lines[i].replace(/^>\s*/, '').trim());
    i++;
  }
  description = descLines.join(' ');

  const promptLines = lines.slice(i).filter(l => !l.startsWith('---'));
  const prompt = promptLines.join('\n').trim();

  if (!prompt) return null;

  return { name, title, description, prompt, filePath: path.join(COMMANDS_DIR, filename), metadata: {} };
}

function extractTitle(body: string): string | null {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) return line.slice(2).trim();
  }
  return null;
}

function extractDescription(body: string): string | null {
  const lines = body.split('\n');
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('>')) {
      descLines.push(line.replace(/^>\s*/, '').trim());
    } else if (descLines.length > 0) {
      break;
    }
  }
  return descLines.join(' ') || null;
}
