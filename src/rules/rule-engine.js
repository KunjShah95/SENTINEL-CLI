import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import minimatch from 'minimatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/*_test.go', '**/*Test.java', '**/*Tests.java', '**/*_test.rs',
  '**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}', '**/__tests__/**',
  '**/src/test/java/**/*.java', '**/src/test/**/*.kt',
  '**/test/**/*_test.py', '**/tests/**/*_test.py', '**/*_test.py',
  '**/*_spec.rb', '**/spec/**/*_spec.rb',
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**',
  '**/vendor/**', '**/__pycache__/**', '**/coverage/**', '**/target/**',
];

const SUPPORTED_EXTENSIONS = new Set([
  'js','jsx','ts','tsx','mjs','cjs','mts','cts',
  'py','java','kt','kts','go','rs','rb','php',
  'c','cpp','cxx','h','hpp','cs','swift',
  'sql','xml','yaml','yml','json','toml','ini','cfg','conf',
  'gradle','properties','env','tf','hcl','dockerfile','dockerignore',
  'html','css','scss','less', 'md', 'rst',
]);

export class RuleEngine {
  constructor(options = {}) {
    this.cache = new Map();
    this.cacheTtl = options.cacheTtl || 60_000;
    this.rules = [];
    this.includePatterns = [];
    this.excludePatterns = [];
    this.loaded = false;
  }

  async load(options = {}) {
    const layers = [
      { source: 'cli', path: options.ruleFlag },
      { source: 'project', path: path.join(process.cwd(), '.sentinel', 'rules.json') },
      { source: 'global', path: path.join(os.homedir(), '.sentinel', 'rules.json') },
      { source: 'system', path: path.join(__dirname, 'system_rules.json') },
    ];

    for (const layer of layers) {
      const data = await this._loadLayer(layer);
      if (data) {
        this.rules = data.rules || [];
        this.includePatterns = data.include || [];
        this.excludePatterns = data.exclude || [];
        this.loaded = true;
        return layer.source;
      }
    }

    this.loaded = true;
    return null;
  }

  async _loadLayer(layer) {
    if (!layer.path) return null;
    try {
      const content = await fs.readFile(layer.path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  resolveRules(filePath) {
    if (!this.loaded) return [];
    const normalized = filePath.replace(/\\/g, '/');
    for (const entry of this.rules) {
      if (minimatch(normalized, entry.path, { dot: true, matchBase: false })) {
        return [{ path: entry.path, rule: entry.rule }];
      }
    }
    return [];
  }

  shouldAnalyze(filePath) {
    const normalized = filePath.replace(/\\/g, '/');

    if (this._isBinary(normalized)) return false;

    if (this.excludePatterns.length > 0 && this._matchesAny(normalized, this.excludePatterns)) return false;

    const ext = normalized.split('.').pop()?.toLowerCase();
    if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) return false;

    if (this.includePatterns.length > 0) {
      return this._matchesAny(normalized, this.includePatterns);
    }

    if (this._matchesAny(normalized, DEFAULT_EXCLUDE_PATTERNS)) return false;

    return true;
  }

  _matchesAny(normalizedPath, patterns) {
    for (const pattern of patterns) {
      if (minimatch(normalizedPath, pattern, { dot: true, matchBase: false })) return true;
    }
    return false;
  }

  _isBinary(filePath) {
    const binaryExts = new Set([
      'png','jpg','jpeg','gif','ico','svg','webp','bmp',
      'woff','woff2','ttf','eot','otf',
      'zip','gz','tar','bz2','7z','rar',
      'exe','dll','so','dylib','wasm',
      'pdf','doc','docx','xls','xlsx','ppt','pptx',
      'mp3','mp4','avi','mov','wav','flac','ogg',
      'pyc','class','jar','war',
      'map','ttf','eot',
    ]);
    const ext = filePath.split('.').pop()?.toLowerCase();
    return binaryExts.has(ext);
  }
}

let instance = null;
export async function getRuleEngine(options = {}) {
  if (!instance) {
    instance = new RuleEngine(options);
    await instance.load(options);
  }
  return instance;
}

export function resetRuleEngine() {
  instance = null;
}
