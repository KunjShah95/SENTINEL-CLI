/**
 * YAML Configuration Manager for Sentinel
 *
 * Loads, validates, and manages .sentinel.yaml configuration.
 * Falls back to .sentinel.json for backward compatibility.
 * Supports config inheritance (org → repo → branch).
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG, validateConfig } from './configSchema.js';

/**
 * Lightweight YAML parser — handles the subset of YAML used in .sentinel.yaml.
 * For full spec compliance, js-yaml is loaded dynamically if available.
 */
async function parseYaml(text) {
  try {
    // Try loading js-yaml (preferred)
    const yaml = await import('js-yaml');
    return yaml.load(text);
  } catch {
    // Fallback: use a simple key-value YAML parser for common patterns
    return parseSimpleYaml(text);
  }
}

async function stringifyYaml(obj) {
  try {
    const yaml = await import('js-yaml');
    return yaml.dump(obj, { indent: 2, lineWidth: 120, noRefs: true });
  } catch {
    return stringifySimpleYaml(obj, 0);
  }
}

/**
 * Simple YAML parser — handles mappings, sequences, scalars, comments, multi-line strings.
 */
function parseSimpleYaml(text) {
  const lines = text.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const commentIdx = line.indexOf('#');
    if (commentIdx >= 0) {
      const inString = line.slice(0, commentIdx).includes("'") || line.slice(0, commentIdx).includes('"');
      if (!inString) line = line.slice(0, commentIdx);
    }
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);
    const content = trimmed.trim();

    // Pop stack until we find appropriate parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (content.startsWith('- ')) {
      // Sequence item
      const value = content.slice(2).trim();
      let target = parent.obj;
      if (!Array.isArray(target)) {
        // Find the last key added to parent that should be an array
        const keys = Object.keys(target);
        const lastKey = keys[keys.length - 1];
        if (lastKey && target[lastKey] === null) {
          target[lastKey] = [];
          target = target[lastKey];
        } else {
          continue;
        }
      }
      if (value.includes(': ')) {
        const obj = {};
        const [k, ...vParts] = value.split(': ');
        obj[k.trim()] = parseScalar(vParts.join(': ').trim());
        target.push(obj);
        stack.push({ obj, indent: indent + 2 });
      } else {
        target.push(parseScalar(value));
      }
    } else if (content.includes(': ')) {
      // Mapping
      const colonIdx = content.indexOf(': ');
      const key = content.slice(0, colonIdx).trim();
      const rawValue = content.slice(colonIdx + 2).trim();

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Nested object or multi-line string
        if (rawValue === '|' || rawValue === '>') {
          // Collect indented lines
          const mlLines = [];
          let j = i + 1;
          const baseIndent = indent + 2;
          while (j < lines.length) {
            const mlLine = lines[j];
            if (mlLine.trim() === '') { mlLines.push(''); j++; continue; }
            const mlIndent = mlLine.search(/\S/);
            if (mlIndent < baseIndent) break;
            mlLines.push(mlLine.slice(baseIndent));
            j++;
          }
          parent.obj[key] = mlLines.join(rawValue === '|' ? '\n' : ' ').trim();
          i = j - 1;
        } else {
          parent.obj[key] = {};
          stack.push({ obj: parent.obj[key], indent });
        }
      } else if (rawValue === '[]') {
        parent.obj[key] = [];
      } else if (rawValue === '{}') {
        parent.obj[key] = {};
      } else {
        parent.obj[key] = parseScalar(rawValue);
      }
    } else if (content.endsWith(':')) {
      // Key with no value (nested object)
      const key = content.slice(0, -1).trim();
      parent.obj[key] = {};
      stack.push({ obj: parent.obj[key], indent });
    }
  }

  return result;
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Strip quotes
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  // Inline array: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(s => parseScalar(s.trim()));
  }
  return value;
}

function stringifySimpleYaml(obj, indent) {
  let result = '';
  const prefix = '  '.repeat(indent);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [firstKey, firstVal] = entries[0];
          if (typeof firstVal === 'object' && firstVal !== null) {
            result += `${prefix}- ${firstKey}:\n${stringifySimpleYaml(firstVal, indent + 2)}`;
          } else {
            result += `${prefix}- ${firstKey}: ${formatScalar(firstVal)}\n`;
          }
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i];
            if (typeof v === 'object' && v !== null) {
              result += `${prefix}  ${k}:\n${stringifySimpleYaml(v, indent + 2)}`;
            } else {
              result += `${prefix}  ${k}: ${formatScalar(v)}\n`;
            }
          }
        }
      } else {
        result += `${prefix}- ${formatScalar(item)}\n`;
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        result += `${prefix}${key}: null\n`;
      } else if (typeof value === 'object') {
        if (Array.isArray(value) && value.length === 0) {
          result += `${prefix}${key}: []\n`;
        } else if (Array.isArray(value)) {
          result += `${prefix}${key}:\n${stringifySimpleYaml(value, indent + 1)}`;
        } else if (Object.keys(value).length === 0) {
          result += `${prefix}${key}: {}\n`;
        } else {
          result += `${prefix}${key}:\n${stringifySimpleYaml(value, indent + 1)}`;
        }
      } else {
        result += `${prefix}${key}: ${formatScalar(value)}\n`;
      }
    }
  }

  return result;
}

function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes("'") ||
        value.includes('"') || value.includes('\n') || value === '' ||
        value === 'true' || value === 'false' || value === 'null' ||
        /^\d/.test(value)) {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return value;
  }
  return String(value);
}


// ─── Main class ────────────────────────────────────────────────────────────────

export class YamlConfigManager {
  constructor(options = {}) {
    this.yamlFileName = '.sentinel.yaml';
    this.jsonFileName = '.sentinel.json';
    this.config = null;
    this.configPath = null;
    this.configSource = null; // 'yaml' | 'json' | 'default'
    this.projectRoot = options.projectRoot || process.cwd();
  }

  /**
   * Get all possible config file paths in priority order.
   */
  getConfigPaths() {
    const paths = [];
    // 1. Local directory (highest priority)
    paths.push(path.join(this.projectRoot, this.yamlFileName));
    paths.push(path.join(this.projectRoot, this.jsonFileName));
    // 2. XDG_CONFIG_HOME
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    paths.push(path.join(xdgConfigHome, 'sentinel', this.yamlFileName));
    paths.push(path.join(xdgConfigHome, 'sentinel', this.jsonFileName));
    // 3. Home directory
    paths.push(path.join(os.homedir(), this.yamlFileName));
    paths.push(path.join(os.homedir(), this.jsonFileName));
    return paths;
  }

  /**
   * Find the first existing config file.
   */
  async findConfigFile() {
    for (const p of this.getConfigPaths()) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Load configuration from YAML or JSON file.
   */
  async load() {
    const filePath = await this.findConfigFile();

    if (filePath) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');

        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          const parsed = await parseYaml(raw);
          this.config = deepMerge(structuredClone(DEFAULT_CONFIG), parsed || {});
          this.configSource = 'yaml';
        } else {
          const parsed = JSON.parse(raw);
          this.config = deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
          this.configSource = 'json';
        }

        this.configPath = filePath;
      } catch (error) {
        console.warn(`⚠  Could not parse config at ${filePath}: ${error.message}`);
        this.config = structuredClone(DEFAULT_CONFIG);
        this.configSource = 'default';
      }
    } else {
      this.config = structuredClone(DEFAULT_CONFIG);
      this.configSource = 'default';
      this.configPath = path.join(this.projectRoot, this.yamlFileName);
    }

    return this.config;
  }

  /**
   * Validate the loaded configuration.
   */
  validate() {
    if (!this.config) return { valid: false, errors: ['No config loaded'] };
    return validateConfig(this.config);
  }

  /**
   * Save configuration as YAML.
   */
  async save(targetPath = null) {
    const savePath = targetPath || this.configPath || path.join(this.projectRoot, this.yamlFileName);
    const dir = path.dirname(savePath);
    try { await fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }

    const content = await stringifyYaml(this.config);
    await fs.writeFile(savePath, content, 'utf8');

    this.configPath = savePath;
    this.configSource = 'yaml';
    return savePath;
  }

  /**
   * Save as JSON (backward compat).
   */
  async saveJson(targetPath = null) {
    const savePath = targetPath || path.join(this.projectRoot, this.jsonFileName);
    const dir = path.dirname(savePath);
    try { await fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }
    await fs.writeFile(savePath, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    this.configPath = savePath;
    this.configSource = 'json';
    return savePath;
  }

  /**
   * Migrate .sentinel.json → .sentinel.yaml
   */
  async migrateToYaml(jsonPath = null) {
    const srcPath = jsonPath || path.join(this.projectRoot, this.jsonFileName);
    if (!existsSync(srcPath)) return false;

    const raw = await fs.readFile(srcPath, 'utf8');
    const jsonConfig = JSON.parse(raw);
    this.config = deepMerge(structuredClone(DEFAULT_CONFIG), jsonConfig);

    const yamlPath = srcPath.replace(/\.json$/, '.yaml');
    await this.save(yamlPath);

    return yamlPath;
  }

  /**
   * Get a config value by dot-notation path.
   */
  get(key, defaultValue = null) {
    if (!this.config) return defaultValue;
    const parts = key.split('.');
    let value = this.config;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }
    return value ?? defaultValue;
  }

  /**
   * Set a config value by dot-notation path.
   */
  set(key, value) {
    if (!this.config) this.config = structuredClone(DEFAULT_CONFIG);
    const parts = key.split('.');
    let target = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in target) || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  // ─── Convenience getters ──────────────────────────────────────────────

  getAutoReviewConfig() {
    return this.get('reviews.auto_review', DEFAULT_CONFIG.reviews.auto_review);
  }

  getPathFilters() {
    return this.get('reviews.path_filters', DEFAULT_CONFIG.reviews.path_filters);
  }

  getPathInstructions() {
    return this.get('reviews.path_instructions', []);
  }

  getReviewStyle() {
    return this.get('reviews.review_style', DEFAULT_CONFIG.reviews.review_style);
  }

  getKnowledgeBaseConfig() {
    return this.get('knowledge_base', DEFAULT_CONFIG.knowledge_base);
  }

  getPreMergeChecks() {
    return this.get('pre_merge_checks', DEFAULT_CONFIG.pre_merge_checks);
  }

  getSastConfig() {
    return this.get('sast', DEFAULT_CONFIG.sast);
  }

  getAutofixConfig() {
    return this.get('autofix', DEFAULT_CONFIG.autofix);
  }

  getFinishingTouches() {
    return this.get('finishing_touches', DEFAULT_CONFIG.finishing_touches);
  }

  /**
   * Resolve path-specific instructions for a given file path.
   */
  resolvePathInstructions(filePath) {
    const instructions = this.getPathInstructions();
    const matched = [];

    for (const entry of instructions) {
      if (matchesGlob(filePath, entry.path)) {
        matched.push(entry.instructions);
      }
    }

    return matched;
  }

  /**
   * Check if a file path should be analyzed based on path_filters.
   */
  shouldAnalyzeFile(filePath) {
    const filters = this.getPathFilters();
    const normalized = filePath.replace(/\\/g, '/');

    // Check exclude patterns
    for (const pattern of filters.exclude) {
      if (matchesGlob(normalized, pattern)) return false;
    }

    // Check include patterns (if specified, file must match at least one)
    if (filters.include.length > 0) {
      return filters.include.some(p => matchesGlob(normalized, p));
    }

    return true;
  }

  /**
   * Inject API keys from config into environment variables.
   */
  injectEnvVars() {
    const providers = this.get('providers', {});
    const envMap = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      ollama: 'OLLAMA_HOST'
    };
    for (const [provider, envKey] of Object.entries(envMap)) {
      const apiKey = providers[provider]?.apiKey;
      if (apiKey && !process.env[envKey]) {
        process.env[envKey] = apiKey;
      }
    }
  }
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source ?? target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Simple glob matching — supports *, **, and ? wildcards.
 */
function matchesGlob(filePath, pattern) {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '[^/]');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

export { parseYaml, stringifyYaml, deepMerge, matchesGlob };
export default YamlConfigManager;
