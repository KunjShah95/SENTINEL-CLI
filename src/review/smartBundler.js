/**
 * Smart File Bundler — groups related files together for more coherent review.
 *
 * Inspired by open-code-review's "Smart File Bundling" feature that groups
 * related files (e.g., message_en.properties + message_zh.properties, or
 * a React component + its test + its styles) into a single review unit.
 *
 * Each bundle runs as an isolated sub-agent context, enabling divide-and-conquer
 * review of large changesets and naturally supporting concurrent review.
 */

import path from 'node:path';

// ─── File relationship patterns ─────────────────────────────────────────────

const BUNDLE_PATTERNS = [
  // Component + Test + Styles
  {
    name: 'component',
    groupKey: (filePath) => {
      const base = path.basename(filePath);
      const ext = path.extname(filePath);
      const name = path.basename(filePath, ext);

      // Match MyComponent.jsx, MyComponent.test.jsx, MyComponent.module.css
      if (/\.(test|spec|module|stories?)\.[a-z]+$/i.test(filePath)) {
        return name.replace(/\.(test|spec|module|stories?)$/i, '');
      }
      return name;
    },
    match: (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return ['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.less', '.module.css', '.module.scss'].includes(ext);
    },
    maxGroupSize: 5,
  },

  // Config files (same name, different extensions)
  {
    name: 'config',
    groupKey: (filePath) => {
      const base = path.basename(filePath);
      return base.replace(/\.[^/.]+$/, ''); // strip extension
    },
    match: (filePath) => {
      const base = path.basename(filePath).toLowerCase();
      return /\.(json|yaml|yml|toml|ini|cfg|conf|env|properties)$/.test(base) &&
        !base.startsWith('package-lock') && !base.startsWith('yarn.lock');
    },
    maxGroupSize: 8,
  },

  // Locale / i18n files
  {
    name: 'locale',
    groupKey: (filePath) => {
      // Group by locale prefix: messages_en.properties → messages, messages_zh.properties → messages
      const base = path.basename(filePath);
      return base.replace(/_[a-z]{2}(_[A-Z]{2})?\.[a-z]+$/i, '')
        .replace(/\.[a-z]+$/i, '');
    },
    match: (filePath) => {
      const base = path.basename(filePath).toLowerCase();
      return /_[a-z]{2}(_[A-Z]{2})?\.(properties|json|yaml|yml|po|mo)$/i.test(base);
    },
    maxGroupSize: 20,
  },

  // Test files with their source files
  {
    name: 'test-source',
    groupKey: (filePath) => {
      const base = path.basename(filePath);
      const ext = path.extname(filePath);
      const name = path.basename(filePath, ext);
      // test/MyComponent.test.js → MyComponent, src/MyComponent.js → MyComponent
      return name.replace(/\.(test|spec|unit|integration|e2e)$/i, '');
    },
    match: (filePath) => {
      const dir = path.dirname(filePath).toLowerCase();
      const base = path.basename(filePath);
      const ext = path.extname(base).toLowerCase();
      // Match test files OR source files that have corresponding tests
      if (/\.(test|spec|unit|integration|e2e)\.[a-z]+$/i.test(base)) return true;
      if (dir.includes('__tests__') || dir.includes('test') || dir.includes('spec')) return true;
      return ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java'].includes(ext);
    },
    maxGroupSize: 6,
  },
];

// ─── Bundler class ───────────────────────────────────────────────────────────

export class SmartBundler {
  constructor(options = {}) {
    this.patterns = options.patterns || BUNDLE_PATTERNS;
    this.maxBundleSize = options.maxBundleSize || 10;
    this.minBundleSize = options.minBundleSize || 2; // files below this stay as singletons
  }

  /**
   * Bundle files into groups for review.
   * @param {string[]} files — list of file paths
   * @param {object} [options]
   * @param {number} [options.concurrency=4] — max bundles to process concurrently
   * @returns {{ bundles: FileBundle[], singletons: string[] }}
   */
  bundle(files, options = {}) {
    const bundles = [];
    const assigned = new Set();
    const concurrency = options.concurrency || 4;

    for (const pattern of this.patterns) {
      const matchedFiles = files.filter(f => pattern.match(f) && !assigned.has(f));
      const groups = new Map();

      for (const file of matchedFiles) {
        const key = pattern.groupKey(file);
        if (!groups.has(key)) groups.set(key, []);
        const group = groups.get(key);
        if (group.length < pattern.maxGroupSize) {
          group.push(file);
        }
      }

      for (const [, group] of groups) {
        if (group.length >= this.minBundleSize) {
          bundles.push({
            id: `bundle_${bundles.length}`,
            pattern: pattern.name,
            files: group,
            size: group.length,
          });
          for (const f of group) assigned.add(f);
        }
      }
    }

    const singletons = files.filter(f => !assigned.has(f));

    // Assign concurrency slots
    for (const bundle of bundles) {
      bundle.slot = Math.min(bundles.indexOf(bundle) % concurrency + 1, concurrency);
    }

    return { bundles, singletons };
  }

  /**
   * Bundle related config files that typically need coordinated review.
   */
  bundleConfigs(diff) {
    const configFiles = diff.filter(f =>
      /\.(json|yaml|yml|toml|env|properties)$/i.test(f) &&
      !/node_modules|dist|build|\.git/i.test(f)
    );
    return this.bundle(configFiles);
  }

  /**
   * Group files by directory for directory-scoped reviews.
   */
  bundleByDirectory(files) {
    const dirs = new Map();
    for (const file of files) {
      const dir = path.dirname(file);
      if (!dirs.has(dir)) dirs.set(dir, []);
      dirs.get(dir).push(file);
    }

    const bundles = [];
    for (const [dir, dirFiles] of dirs) {
      bundles.push({
        id: `dir_${dir.replace(/[^a-zA-Z0-9]/g, '_')}`,
        pattern: 'directory',
        directory: dir,
        files: dirFiles,
        size: dirFiles.length,
      });
    }
    return { bundles, singletons: [] };
  }

  /**
   * Returns a human-readable summary of the bundling.
   */
  summarize(result) {
    const lines = [];
    lines.push(`  Bundles: ${result.bundles.length}`);
    lines.push(`  Bundled files: ${result.bundles.reduce((s, b) => s + b.size, 0)}`);
    lines.push(`  Singleton files: ${result.singletons.length}`);

    for (const bundle of result.bundles) {
      const names = bundle.files.map(f => path.basename(f)).join(', ');
      lines.push(`    [${bundle.pattern}] ${names}`);
    }

    return lines.join('\n');
  }
}

export default SmartBundler;
