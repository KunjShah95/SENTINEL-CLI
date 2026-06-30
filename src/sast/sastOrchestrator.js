/**
 * SAST Orchestrator
 *
 * Auto-detects languages in changed files, dispatches appropriate tools,
 * runs them in parallel, and aggregates results into a unified format.
 */

import { toolRegistry } from './toolRegistry.js';
import { ToolInstaller } from './toolInstaller.js';
import { getParser } from './parsers/index.js';

export class SastOrchestrator {
  constructor(options = {}) {
    this.installer = new ToolInstaller();
    this.config = options.config || {};
    this.cwd = options.cwd || process.cwd();
    this.timeout = options.timeout || 60_000;
    this.maxConcurrentTools = options.maxConcurrentTools || 4;
    this.enabledTools = options.enabledTools || null; // null = all
    this.disabledTools = options.disabledTools || [];
  }

  /**
   * Detect languages from a set of changed files.
   * @param {string[]} files - File paths
   * @returns {string[]} Detected languages (file extensions)
   */
  detectLanguages(files) {
    const extSet = new Set();
    const extensionMap = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
      ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx',
      py: 'py', pyw: 'py', pyi: 'py',
      go: 'go',
      java: 'java',
      kt: 'kt', kts: 'kt',
      rs: 'rs',
      rb: 'rb', rake: 'rb',
      swift: 'swift',
      php: 'php',
      c: 'c', h: 'c',
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
      sh: 'sh', bash: 'bash', zsh: 'sh',
      sql: 'sql',
      tf: 'tf', tfvars: 'tf',
      yaml: 'yaml', yml: 'yml',
      json: 'json',
      md: 'md', mdx: 'md',
      css: 'css', scss: 'scss', less: 'less',
      html: 'html', htm: 'html',
    };

    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase();
      if (ext && extensionMap[ext]) {
        extSet.add(extensionMap[ext]);
      }
      // Special files
      if (/dockerfile/i.test(file)) extSet.add('dockerfile');
    }

    return [...extSet];
  }

  /**
   * Run SAST analysis on changed files.
   * @param {string[]} files - Changed file paths
   * @param {object} options - { cwd, timeout, tools }
   */
  async analyze(files, options = {}) {
    const startTime = Date.now();
    const cwd = options.cwd || this.cwd;

    // Step 1: Detect languages
    const languages = this.detectLanguages(files);
    console.log(`  Detected languages: ${languages.join(', ') || 'none'}`);

    if (languages.length === 0) {
      return {
        findings: [],
        toolsRun: [],
        toolsSkipped: [],
        languages: [],
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Get applicable tools
    const allExtensions = [...languages, ...files.map(f => f.split('.').pop()).filter(Boolean)];
    let applicableTools = toolRegistry.getToolsForExtensions(allExtensions);

    // Filter by config
    if (this.enabledTools) {
      applicableTools = applicableTools.filter(t => this.enabledTools.includes(t.name));
    }
    applicableTools = applicableTools.filter(t => !this.disabledTools.includes(t.name));

    // Always include universal security scanners
    const universalTools = toolRegistry.getToolsForLanguage('*');
    for (const tool of universalTools) {
      if (!applicableTools.find(t => t.name === tool.name) && !this.disabledTools.includes(tool.name)) {
        if (!this.enabledTools || this.enabledTools.includes(tool.name)) {
          applicableTools.push(tool);
        }
      }
    }

    console.log(`  Applicable tools: ${applicableTools.map(t => t.name).join(', ')}`);

    // Step 3: Check tool availability
    const availableTools = await this.installer.getAvailableTools(applicableTools);
    const skippedTools = applicableTools.filter(t => !availableTools.includes(t));

    if (skippedTools.length > 0) {
      console.log(`  Skipped (not installed): ${skippedTools.map(t => t.name).join(', ')}`);
    }

    console.log(`  Running ${availableTools.length} tools...`);

    // Step 4: Run tools in parallel batches
    const allFindings = [];
    const toolsRun = [];
    const errors = [];

    for (let i = 0; i < availableTools.length; i += this.maxConcurrentTools) {
      const batch = availableTools.slice(i, i + this.maxConcurrentTools);
      const results = await Promise.allSettled(
        batch.map(tool => this.runTool(tool, files, { cwd, timeout: options.timeout || this.timeout }))
      );

      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allFindings.push(...result.value.findings);
          if (result.value.findings.length > 0 || !result.value.error) {
            toolsRun.push(batch[j].name);
          }
          if (result.value.error) {
            errors.push(`${batch[j].name}: ${result.value.error}`);
          }
        } else {
          errors.push(`${batch[j].name}: ${result.reason?.message || 'Unknown error'}`);
        }
      }
    }

    // Step 5: Deduplicate findings
    const deduplicated = this.deduplicateFindings(allFindings);

    return {
      findings: deduplicated,
      toolsRun,
      toolsSkipped: skippedTools.map(t => t.name),
      languages,
      errors,
      durationMs: Date.now() - startTime,
      installSuggestions: this.installer.getInstallSuggestions(skippedTools),
    };
  }

  /**
   * Run a single SAST tool.
   */
  async runTool(tool, files, options = {}) {
    const cwd = options.cwd || this.cwd;
    const timeout = options.timeout || this.timeout;

    try {
      const { execSync } = await import('child_process');

      // Build command - replace {files} with actual file paths
      const fileArgs = files
        .filter(f => {
          const ext = f.split('.').pop()?.toLowerCase();
          return tool.languages.includes('*') ||
            tool.languages.some(lang => {
              const langExts = this.getExtensionsForLang(lang);
              return langExts.includes(ext);
            });
        })
        .map(f => `"${f}"`)
        .join(' ');

      let command = tool.runCommand;
      if (command.includes('{files}')) {
        command = command.replace('{files}', fileArgs || '.');
      }

      const stdout = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 20 * 1024 * 1024,
        timeout,
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse output
      const parser = getParser(tool.name);
      const findings = parser(stdout);

      return {
        findings,
        tool: tool.name,
        error: null,
      };
    } catch (error) {
      // Many tools exit with non-zero when findings exist
      const stdout = error.stdout || error.output?.filter(Boolean).join('') || '';
      if (stdout) {
        const parser = getParser(tool.name);
        const findings = parser(stdout);
        if (findings.length > 0) {
          return { findings, tool: tool.name, error: null };
        }
      }

      return {
        findings: [],
        tool: tool.name,
        error: error.message?.split('\n')[0] || 'Tool execution failed',
      };
    }
  }

  /**
   * Get file extensions for a language.
   */
  getExtensionsForLang(lang) {
    const map = {
      js: ['js', 'mjs', 'cjs'], ts: ['ts', 'mts', 'cts'],
      jsx: ['jsx'], tsx: ['tsx'], py: ['py', 'pyw', 'pyi'],
      go: ['go'], java: ['java'], kt: ['kt', 'kts'],
      rs: ['rs'], rb: ['rb'], swift: ['swift'], php: ['php'],
      c: ['c', 'h'], cpp: ['cpp', 'cc', 'cxx', 'hpp'],
      sh: ['sh', 'bash', 'zsh'], bash: ['sh', 'bash'],
      sql: ['sql'], tf: ['tf', 'tfvars'],
      yaml: ['yaml', 'yml'], yml: ['yaml', 'yml'],
      json: ['json'], md: ['md', 'mdx'],
      css: ['css'], scss: ['scss'], less: ['less'],
      html: ['html', 'htm'], dockerfile: ['dockerfile'],
    };
    return map[lang] || [lang];
  }

  /**
   * Deduplicate findings that overlap across tools.
   */
  deduplicateFindings(findings) {
    const seen = new Map();

    for (const finding of findings) {
      const key = `${finding.file}:${finding.line}:${finding.message?.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.set(key, finding);
      } else {
        // Keep the higher severity finding
        const existing = seen.get(key);
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        if ((severityOrder[finding.severity] || 0) > (severityOrder[existing.severity] || 0)) {
          seen.set(key, finding);
        }
      }
    }

    return [...seen.values()];
  }

  /**
   * Format SAST results for display.
   */
  formatResults(results) {
    const { findings, toolsRun, toolsSkipped, errors, durationMs } = results;

    let output = `## SAST Analysis Results\n\n`;
    output += `**Tools Run:** ${toolsRun.join(', ') || 'none'}\n`;
    output += `**Tools Skipped:** ${toolsSkipped.length}\n`;
    output += `**Findings:** ${findings.length}\n`;
    output += `**Duration:** ${durationMs}ms\n\n`;

    if (findings.length > 0) {
      // Group by severity
      const bySeverity = { critical: [], high: [], medium: [], low: [], info: [] };
      for (const f of findings) {
        (bySeverity[f.severity] || bySeverity.medium).push(f);
      }

      for (const [severity, items] of Object.entries(bySeverity)) {
        if (items.length === 0) continue;
        output += `### ${severity.toUpperCase()} (${items.length})\n\n`;
        for (const item of items.slice(0, 20)) {
          output += `- **[${item.tool}]** ${item.file || '?'}:${item.line || '?'} — ${item.message}\n`;
        }
        if (items.length > 20) output += `- _... and ${items.length - 20} more_\n`;
        output += '\n';
      }
    }

    if (errors.length > 0) {
      output += `### Errors\n\n`;
      for (const err of errors) {
        output += `- ${err}\n`;
      }
    }

    return output;
  }
}

export default SastOrchestrator;
