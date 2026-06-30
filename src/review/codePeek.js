/**
 * Code Peek
 *
 * Symbol lookup: click any symbol to find definitions and usages via AST.
 * Provides quick navigation to related code within the PR diff.
 */

// Lightweight regex-based symbol extractor (no tree-sitter dependency required)
const SYMBOL_PATTERNS = [
  // Functions: function foo, const foo = function, const foo = (...) =>
  { type: 'function', regex: /(?:function\s+([a-zA-Z_$][\w$]*)|(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function|\(|[\w$]+\s*=>))/g },
  // Classes: class Foo
  { type: 'class', regex: /class\s+([a-zA-Z_$][\w$]*)/g },
  // Methods: foo(...) { or async foo(...) {
  { type: 'method', regex: /(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g },
  // Interfaces/Types: interface Foo, type Foo
  { type: 'type', regex: /(?:interface|type)\s+([A-Z][\w$]*)/g },
  // Exports: export function/class/const foo
  { type: 'export', regex: /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([a-zA-Z_$][\w$]*)/g },
  // Imports: import { foo } from, import foo from
  { type: 'import', regex: /import\s+(?:(?:\{([^}]+)\})|([a-zA-Z_$][\w$]*))\s+from/g },
];

export class CodePeek {
  constructor(options = {}) {
    this.symbolIndex = new Map(); // symbolName → [{ file, line, type, context }]
  }

  /**
   * Index all changed files for symbol lookup.
   * @param {Array<{path: string, patch?: string, content?: string}>} files
   */
  indexFiles(files) {
    this.symbolIndex.clear();

    for (const file of files) {
      const content = file.content || file.patch || '';
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of SYMBOL_PATTERNS) {
          pattern.regex.lastIndex = 0;
          let match;
          while ((match = pattern.regex.exec(line)) !== null) {
            const symbolName = match[1] || match[2];
            if (!symbolName || symbolName.length < 2) continue;

            if (!this.symbolIndex.has(symbolName)) {
              this.symbolIndex.set(symbolName, []);
            }
            this.symbolIndex.get(symbolName).push({
              file: file.path,
              line: i + 1,
              type: pattern.type,
              context: line.trim().substring(0, 120),
            });
          }
        }
      }
    }

    return this.symbolIndex.size;
  }

  /**
   * Look up a symbol and return all locations where it's defined or used.
   * @param {string} symbolName
   * @returns {{ definitions: Array, usages: Array }}
   */
  lookup(symbolName) {
    const entries = this.symbolIndex.get(symbolName) || [];

    const definitions = entries.filter(e =>
      e.type === 'function' || e.type === 'class' || e.type === 'type' || e.type === 'export'
    );
    const usages = entries.filter(e =>
      e.type === 'import' || e.type === 'method'
    );

    // Also search for references in all indexed entries
    const references = [];
    for (const [name, locs] of this.symbolIndex) {
      if (name === symbolName) continue;
      for (const loc of locs) {
        if (loc.context.includes(symbolName)) {
          references.push(loc);
        }
      }
    }

    return {
      symbol: symbolName,
      definitions,
      usages,
      references: references.slice(0, 20), // Cap at 20 references
      totalOccurrences: definitions.length + usages.length + references.length,
    };
  }

  /**
   * Get all indexed symbols sorted by occurrence count.
   */
  getSymbols() {
    const symbols = [];
    for (const [name, entries] of this.symbolIndex) {
      const types = new Set(entries.map(e => e.type));
      symbols.push({
        name,
        occurrences: entries.length,
        types: [...types],
        files: [...new Set(entries.map(e => e.file))],
      });
    }
    return symbols.sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Find symbols that are defined in one file and used in another (cross-file references).
   */
  findCrossFileReferences() {
    const crossRefs = [];

    for (const [name, entries] of this.symbolIndex) {
      const files = new Set(entries.map(e => e.file));
      if (files.size > 1) {
        const definitions = entries.filter(e => e.type === 'function' || e.type === 'class' || e.type === 'export');
        const imports = entries.filter(e => e.type === 'import');

        if (definitions.length > 0 && imports.length > 0) {
          crossRefs.push({
            symbol: name,
            definedIn: [...new Set(definitions.map(e => e.file))],
            usedIn: [...new Set(imports.map(e => e.file))],
          });
        }
      }
    }

    return crossRefs;
  }

  /**
   * Format a symbol lookup result as a PR comment snippet.
   */
  formatAsComment(result) {
    if (!result || result.totalOccurrences === 0) return '';

    let body = `<details><summary>🔍 <strong>${result.symbol}</strong> — ${result.totalOccurrences} occurrence(s)</summary>\n\n`;

    if (result.definitions.length > 0) {
      body += '**Definitions:**\n';
      for (const def of result.definitions) {
        body += `- \`${def.file}:${def.line}\` (${def.type}) — \`${def.context}\`\n`;
      }
      body += '\n';
    }

    if (result.usages.length > 0) {
      body += '**Usages:**\n';
      for (const usage of result.usages) {
        body += `- \`${usage.file}:${usage.line}\` — \`${usage.context}\`\n`;
      }
      body += '\n';
    }

    if (result.references.length > 0) {
      body += `**References:** (${result.references.length})\n`;
      for (const ref of result.references.slice(0, 5)) {
        body += `- \`${ref.file}:${ref.line}\` — \`${ref.context}\`\n`;
      }
      if (result.references.length > 5) {
        body += `- _... and ${result.references.length - 5} more_\n`;
      }
    }

    body += '\n</details>';
    return body;
  }
}

export default CodePeek;
