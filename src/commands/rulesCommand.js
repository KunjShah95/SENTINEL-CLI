/**
 * Rules Check Command — preview which review rules apply to a file path.
 *
 * Inspired by open-code-review's `ocr rules check <file>` command.
 * Shows which rules would fire against a given file without running
 * the full analysis pipeline.
 */

import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import RuleEngine from '../core/rules/ruleEngine.js';

export class RulesCommand {
  constructor(options = {}) {
    this.engine = options.engine || new RuleEngine();
  }

  /**
   * Show which rules apply to a file.
   * @param {string} filePath — path to check
   * @param {object} [options]
   * @param {string} [options.rule] — path to custom JSON rules file
   * @param {number} [options.maxResults=20] — max rules to show
   * @returns {{ file: string, extension: string, matched: object[], total: number, applicableRules: number }}
   */
  async check(filePath, options = {}) {
    const absPath = path.resolve(filePath);
    const ext = path.extname(absPath).toLowerCase();
    const base = path.basename(absPath);
    const dir = path.dirname(absPath);
    const fullPath = absPath;

    // Load custom rules if provided
    if (options.rule) {
      await this._loadCustomRules(options.rule);
    }

    // Build file context for rule matching
    const fileContext = this._buildFileContext(fullPath, ext, base, dir);

    // Get all registered rules and filter by those that would apply
    const allRules = this.engine.getRules();
    const matched = [];
    const totalApplicable = [];

    for (const ruleDef of allRules) {
      const rule = ruleDef.name;
      const ruleData = this.engine.rules.get(rule);

      if (!ruleData) continue;

      try {
        const result = this.engine.evaluate(ruleData.rule, fileContext, {});
        if (result) {
          matched.push({
            rule,
            description: ruleData.options?.description || rule,
            category: this._inferCategory(rule),
            severity: ruleData.options?.severity || 'medium',
            applies: true,
          });
        }
        totalApplicable.push(rule);
      } catch {
        // Skip rules that can't be evaluated
      }
    }

    // Show rules that would fire against this file type
    const fileTypeRules = this._getFileTypeRules(ext, base);

    return {
      file: fullPath,
      extension: ext,
      language: this._extToLang(ext),
      size: this._getFileSize(fullPath),
      matched: matched.slice(0, options.maxResults || 20),
      total: matched.length,
      applicableRules: totalApplicable.length,
      fileTypeSpecific: fileTypeRules,
    };
  }

  /**
   * Format the check result as a human-readable string.
   */
  format(result) {
    const lines = [];
    lines.push('── Rules Check ────────────────────────────────────────────');
    lines.push('');
    lines.push(`  File:       ${result.file}`);
    lines.push(`  Language:   ${result.language}`);
    lines.push(`  Extension:  ${result.extension}`);
    if (result.size !== null) {
      lines.push(`  Size:       ${result.size}`);
    }
    lines.push('');
    lines.push(`  Active rules: ${result.total}`);

    if (result.matched.length > 0) {
      lines.push('');
      lines.push('  Rules that apply to this file:');
      for (const r of result.matched) {
        const icon = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟠' :
          r.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`    ${icon} [${r.category}] ${r.description}`);
      }
    }

    if (result.fileTypeSpecific.length > 0) {
      lines.push('');
      lines.push('  File-type-specific rules:');
      for (const r of result.fileTypeSpecific) {
        lines.push(`    • ${r}`);
      }
    }

    lines.push('');
    lines.push(`  Total rules in engine: ${result.applicableRules}`);
    lines.push('───────────────────────────────────────────────────────────');

    return lines.join('\n');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  async _loadCustomRules(rulePath) {
    try {
      const rules = JSON.parse(readFileSync(rulePath, 'utf-8'));
      if (rules.rules) {
        for (const [name, def] of Object.entries(rules.rules)) {
          this.engine.addRule(name, def.rule, def.options || {});
        }
      }
    } catch (e) {
      throw new Error(`Failed to load custom rules: ${e.message}`);
    }
  }

  _buildFileContext(fullPath, ext, base, dir) {
    const lines = this._readFileLines(fullPath);
    const content = lines ? lines.join('\n') : '';

    return {
      path: fullPath,
      file: base,
      dir,
      ext,
      name: path.basename(base, ext),
      size: content.length,
      lines: lines ? lines.length : 0,
      content,
      isTest: /\.(test|spec)\./.test(base) || dir.includes('__tests__') || dir.includes('test'),
      isConfig: /\.(json|yaml|yml|toml|env|properties)$/i.test(base),
      isSource: /\.(js|ts|jsx|tsx|py|go|rs|java)$/i.test(ext),
    };
  }

  _readFileLines(filePath) {
    try {
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8').split('\n');
      }
    } catch { /* ignore */ }
    return null;
  }

  _getFileSize(filePath) {
    try {
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        if (stat.size < 1024) return `${stat.size} B`;
        if (stat.size < 1024 * 1024) return `${(stat.size / 1024).toFixed(1)} KB`;
        return `${(stat.size / (1024 * 1024)).toFixed(1)} MB`;
      }
    } catch { /* ignore */ }
    return null;
  }

  _getFileTypeRules(ext, base) {
    const rules = [];

    // JavaScript/TypeScript
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(ext)) {
      rules.push('security/no-eval', 'security/no-hardcoded-secrets', 'quality/no-console',
        'quality/complexity', 'bug/null-dereference');
    }

    // Python
    if (ext === '.py') {
      rules.push('security/sql-injection', 'security/command-injection', 'quality/import-style');
    }

    // Config files
    if (/\.(json|yaml|yml)$/i.test(ext)) {
      rules.push('security/no-plaintext-secrets', 'schema/validate');
    }

    // Makefiles / Dockerfiles
    if (base === 'Dockerfile' || base.endsWith('.dockerfile')) {
      rules.push('security/no-latest-tag', 'security/no-root-user');
    }

    // Test files
    if (/\.(test|spec)\./i.test(base)) {
      rules.push('quality/test-coverage', 'quality/test-assertions');
    }

    return rules;
  }

  _inferCategory(ruleName) {
    if (/security|secret|xss|sqli|injection/i.test(ruleName)) return 'security';
    if (/bug|null|error|exception/i.test(ruleName)) return 'bug';
    if (/quality|complexity|duplication|style/i.test(ruleName)) return 'quality';
    if (/performance|perf/i.test(ruleName)) return 'performance';
    return 'general';
  }

  _extToLang(ext) {
    const map = {
      '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.mjs': 'JavaScript (ESM)',
      '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
      '.py': 'Python',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java', '.kt': 'Kotlin',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.css': 'CSS', '.scss': 'SCSS',
      '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
      '.md': 'Markdown',
      '.sql': 'SQL',
      '.sh': 'Shell', '.bash': 'Shell',
    };
    return map[ext] || ext || 'unknown';
  }
}

export default RulesCommand;
