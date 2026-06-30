/**
 * Command Template Engine — opencode-inspired custom slash commands.
 *
 * Command files are Markdown with YAML frontmatter stored in `.sentinel/commands/`.
 *
 * Format:
 * ```
 * ---
 * description: "Generate tests for a file"
 * argument-hint: "<file-path> [--coverage]"
 * allowed-tools: ["readFile", "writeFile", "bash"]
 * ---
 * Generate comprehensive unit tests for `$1`.
 *
 * Additional arguments: $2
 *
 * Full input: $ARGUMENTS
 *
 * Include the file contents:
 * @file $1
 * ```
 *
 * Variable substitution:
 *   $ARGUMENTS  — full argument string after the command name
 *   $1, $2, ... — positional arguments (space-separated)
 *   !`command`  — shell command injection (output replaces the expression)
 *   @file path  — reads and inlines file contents
 *   {{mode}}    — current agent mode
 *   {{model}}   — current model ID
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Parse YAML frontmatter from command file content.
 * Simple parser — handles key: value pairs and arrays.
 */
export function parseFrontmatter(content) {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(fmRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const raw = match[1];
  const body = content.slice(match[0].length).trim();
  const metadata = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse simple arrays: ["a", "b", "c"]
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if parse fails
      }
    }

    // Parse boolean
    if (value === 'true') value = true;
    if (value === 'false') value = false;

    metadata[key] = value;
  }

  return { metadata, body };
}

/**
 * Resolve positional arguments from the argument string.
 * @param {string} argString — full argument string
 * @returns {string[]} — array of positional arguments
 */
export function parsePositionalArgs(argString) {
  if (!argString || !argString.trim()) return [];

  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const ch of argString) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current) args.push(current);
  return args;
}

/**
 * Execute a shell command from !`...` injection.
 * @param {string} command — the shell command to run
 * @param {number} [timeoutMs] — timeout in ms (default: 5000)
 * @returns {string} — command stdout
 */
export function executeShellInjection(command, timeoutMs = 5000) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    return `[shell error: ${err.message}]`;
  }
}

/**
 * Read a file for @file reference.
 * @param {string} filePath — relative file path
 * @param {number} [maxChars] — max characters to read (default: 10000)
 * @returns {string} — file contents
 */
export function readFileReference(filePath, maxChars = 10000) {
  const resolved = path.resolve(process.cwd(), filePath);
  try {
    if (!existsSync(resolved)) {
      return `[file not found: ${filePath}]`;
    }
    const content = readFileSync(resolved, 'utf-8');
    if (content.length > maxChars) {
      return content.slice(0, maxChars) + `\n... (truncated, ${content.length} total chars)`;
    }
    return content;
  } catch (err) {
    return `[file error: ${err.message}]`;
  }
}

/**
 * Process a command template with full variable substitution.
 *
 * @param {string} template — the command body template
 * @param {object} context — substitution context
 * @param {string} context.arguments — full argument string
 * @param {string} context.mode — current agent mode
 * @param {string} context.model — current model ID
 * @param {boolean} [context.allowShell] — allow !`shell` injections (default: true)
 * @param {boolean} [context.allowFileRefs] — allow @file references (default: true)
 * @returns {string} — processed prompt
 */
export function processTemplate(template, context = {}) {
  const {
    arguments: argString = '',
    mode = 'BUILD',
    model = '',
    allowShell = true,
    allowFileRefs = true,
  } = context;

  const positionalArgs = parsePositionalArgs(argString);
  let result = template;

  // 1. Replace $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, argString);

  // 2. Replace positional args $1, $2, etc.
  result = result.replace(/\$(\d+)/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    return positionalArgs[idx] || match;
  });

  // 3. Replace {{mode}} and {{model}}
  result = result.replace(/\{\{mode\}\}/g, mode);
  result = result.replace(/\{\{model\}\}/g, model);

  // 4. Process !`shell` injections
  if (allowShell) {
    result = result.replace(/!`([^`]+)`/g, (match, cmd) => {
      return executeShellInjection(cmd);
    });
  }

  // 5. Process @file references
  if (allowFileRefs) {
    result = result.replace(/@file\s+(\S+)/g, (match, filePath) => {
      // Resolve any remaining variables in the file path
      const resolvedPath = filePath.replace(/\$(\d+)/g, (m, num) => {
        const idx = parseInt(num, 10) - 1;
        return positionalArgs[idx] || m;
      });
      return readFileReference(resolvedPath);
    });
  }

  return result;
}
