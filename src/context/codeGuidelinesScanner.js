/**
 * Code Guidelines Scanner
 *
 * Scans project files for coding guidelines and conventions:
 *   .cursorrules, CLAUDE.md, .github/copilot-instructions.md,
 *   .sentinel.yaml path_instructions, CONVENTIONS.md, STYLEGUIDE.md
 *
 * Returns a structured summary of guidelines to inject into LLM prompts.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

const GUIDELINE_SOURCES = [
  '.cursorrules',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  'CONVENTIONS.md',
  'STYLEGUIDE.md',
  'AGENTS.md',
  '.ai-guidelines.md',
  '.sentinel/guidelines.md',
];

export class CodeGuidelinesScanner {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.extraSources = options.sources || [];
    this.maxGuidelineChars = options.maxChars || 10000;
  }

  /**
   * Scan all guideline sources and return combined guidelines.
   */
  async scan() {
    const sources = [...GUIDELINE_SOURCES, ...this.extraSources];
    const guidelines = [];

    for (const source of sources) {
      const filePath = path.join(this.projectRoot, source);
      if (!existsSync(filePath)) continue;

      try {
        const content = await fs.readFile(filePath, 'utf8');
        if (content.trim().length > 0) {
          guidelines.push({
            source,
            content: content.trim().slice(0, this.maxGuidelineChars),
            length: content.length,
          });
        }
      } catch (error) {
        console.warn(`[guidelines] Failed to read ${source}: ${error.message}`);
      }
    }

    // Also load path_instructions from .sentinel.yaml
    const yamlInstructions = await this.loadPathInstructions();
    if (yamlInstructions.length > 0) {
      guidelines.push({
        source: '.sentinel.yaml path_instructions',
        content: yamlInstructions.map(i => `- ${i.path}: ${i.instructions}`).join('\n'),
        length: yamlInstructions.length,
      });
    }

    return {
      guidelines,
      summary: this.buildSummary(guidelines),
      totalChars: guidelines.reduce((sum, g) => sum + g.content.length, 0),
    };
  }

  /**
   * Load path_instructions from .sentinel.yaml config.
   */
  async loadPathInstructions() {
    try {
      const { configManager } = await import('../config/configManager.js');
      await configManager.load();
      return configManager.getPathInstructions();
    } catch {
      return [];
    }
  }

  /**
   * Build a concise summary of all guidelines for LLM injection.
   */
  buildSummary(guidelines) {
    if (guidelines.length === 0) return '';

    let summary = '## Project Guidelines & Conventions\n\n';
    for (const g of guidelines) {
      summary += `### From: ${g.source}\n`;
      summary += g.content + '\n\n';
    }

    // Truncate if too long
    if (summary.length > this.maxGuidelineChars) {
      summary = summary.slice(0, this.maxGuidelineChars) + '\n\n_... guidelines truncated for brevity ..._';
    }

    return summary;
  }

  /**
   * Get guidelines relevant to a specific file path.
   */
  async getGuidelinesForFile(filePath) {
    const all = await this.scan();
    const { configManager } = await import('../config/configManager.js');
    await configManager.load();
    const pathInstructions = await configManager.resolvePathInstructions(filePath);

    let relevant = all.summary;
    if (pathInstructions.length > 0) {
      relevant += '\n\n## Path-Specific Instructions\n';
      relevant += pathInstructions.join('\n');
    }

    return relevant;
  }
}

export default CodeGuidelinesScanner;
