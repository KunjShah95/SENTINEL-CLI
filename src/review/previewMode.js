/**
 * Preview Mode — shows which files will be reviewed without running the LLM.
 *
 * Inspired by open-code-review's `--preview` flag.
 * Useful for CI and quick validation of what the review scope would be.
 */

import { SmartBundler } from './smartBundler.js';

export class PreviewMode {
  constructor(options = {}) {
    this.bundler = options.bundler || new SmartBundler();
  }

  /**
   * Generate a preview of what would be reviewed.
   * @param {string[]} files — list of file paths that would be reviewed
   * @param {object} [options]
   * @param {string} [options.from] — base ref (for branch diff)
   * @param {string} [options.to] — head ref
   * @param {string} [options.commit] — single commit SHA
   * @param {number} [options.concurrency=4] — max concurrent reviews
   * @returns {PreviewResult}
   */
  preview(files, options = {}) {
    const bundling = this.bundler.bundle(files, { concurrency: options.concurrency || 4 });
    const totalFiles = files.length;
    const totalBundled = bundling.bundles.reduce((s, b) => s + b.size, 0);

    // Count by file type
    const byExtension = {};
    for (const file of files) {
      const ext = file.split('.').pop() || 'unknown';
      byExtension[ext] = (byExtension[ext] || 0) + 1;
    }

    // Count by language
    const byLanguage = this._classifyByLanguage(files);

    return {
      mode: 'preview',
      timestamp: new Date().toISOString(),
      refs: { from: options.from || null, to: options.to || null, commit: options.commit || null },
      total: totalFiles,
      bundled: {
        count: bundling.bundles.length,
        files: totalBundled,
        groups: bundling.bundles.map(b => ({
          pattern: b.pattern,
          files: b.files,
          count: b.size,
        })),
      },
      singletons: bundling.singletons.length,
      byExtension: Object.entries(byExtension)
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => ({ ext, count })),
      byLanguage: Object.entries(byLanguage)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => ({ lang, count })),
      concurrency: options.concurrency || 4,
      estimatedDuration: this._estimateDuration(totalFiles, bundling.bundles.length),
      rules: this._listApplicableRules(files),
    };
  }

  /**
   * Format the preview as a human-readable string.
   */
  format(result) {
    const lines = [];
    lines.push('── Preview Mode ──────────────────────────────────────────');
    lines.push('');
    lines.push(`  Total files to review: ${result.total}`);
    lines.push(`  Concurrency:          ${result.concurrency}`);
    lines.push(`  Estimated duration:   ${result.estimatedDuration}`);

    if (result.refs.from) {
      lines.push(`  Diff:                 ${result.refs.from} → ${result.refs.to || 'HEAD'}`);
    }
    if (result.refs.commit) {
      lines.push(`  Commit:               ${result.refs.commit}`);
    }

    lines.push('');

    // Bundle groups
    if (result.bundled.count > 0) {
      lines.push(`  Smart bundles (${result.bundled.count} groups, ${result.bundled.files} files):`);
      for (const group of result.bundled.groups) {
        const names = group.files.map(f => f.split('/').pop()).join(', ');
        lines.push(`    [${group.pattern}] ${names}`);
      }
      lines.push('');
    }

    // By language
    lines.push('  Files by language:');
    for (const { lang, count } of result.byLanguage) {
      const bar = '█'.repeat(Math.round((count / result.total) * 20) || 1);
      lines.push(`    ${bar} ${lang} (${count})`);
    }
    lines.push('');

    // By extension
    lines.push('  Files by extension:');
    for (const { ext, count } of result.byExtension.slice(0, 10)) {
      lines.push(`    .${ext}: ${count}`);
    }
    lines.push('');

    // Rules
    if (result.rules.length > 0) {
      lines.push('  Applicable rules:');
      for (const rule of result.rules) {
        lines.push(`    • ${rule}`);
      }
      lines.push('');
    }

    lines.push('  Run without --preview to start the actual review.');
    lines.push('───────────────────────────────────────────────────────────');

    return lines.join('\n');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _classifyByLanguage(files) {
    const langMap = {
      js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
      ts: 'TypeScript', tsx: 'TypeScript',
      py: 'Python',
      go: 'Go',
      rs: 'Rust',
      java: 'Java', kt: 'Kotlin',
      rb: 'Ruby',
      php: 'PHP',
      cs: 'C#',
      cpp: 'C++', c: 'C', h: 'C/C++', hpp: 'C++',
      css: 'CSS', scss: 'SCSS', less: 'LESS',
      json: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML',
      md: 'Markdown',
      sql: 'SQL',
      sh: 'Shell', bash: 'Shell', zsh: 'Shell',
      dockerfile: 'Docker',
    };
    const counts = {};
    for (const file of files) {
      const ext = file.split('.').pop() || 'unknown';
      const name = file.split('/').pop() || '';
      if (name === 'Dockerfile' || name.endsWith('.dockerfile')) {
        counts['Docker'] = (counts['Docker'] || 0) + 1;
      } else {
        const lang = langMap[ext] || ext;
        counts[lang] = (counts[lang] || 0) + 1;
      }
    }
    return counts;
  }

  _estimateDuration(totalFiles, bundles) {
    // Rough estimate: ~2s per bundle + ~0.5s per singleton
    const secs = (bundles * 2) + (Math.max(0, totalFiles - bundles * 3) * 0.5);
    if (secs < 60) return `${Math.round(secs)}s`;
    return `${Math.round(secs / 60)}m ${Math.round(secs % 60)}s`;
  }

  _listApplicableRules(_files) {
    try {
      // Dynamically check if RuleEngine is available
      // In production, this would query the rule engine
      return [
        'security/sql-injection',
        'security/xss',
        'security/hardcoded-secrets',
        'quality/complexity',
        'quality/duplication',
        'bug/null-dereference',
      ];
    } catch {
      return [];
    }
  }
}

export default PreviewMode;
