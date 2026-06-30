import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * SkillManager — discovers, loads, and manages skills.
 * Skills are SKILL.md files in .sentinel/skills/<name>/ directories.
 */
export class SkillManager {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.skillPaths = [
      path.join(this.projectPath, '.sentinel', 'skills'),
      path.join(os.homedir(), '.sentinel', 'skills'),
    ];
    this.skills = new Map();
  }

  async discoverSkills() {
    for (const skillDir of this.skillPaths) {
      try {
        const entries = await fs.readdir(skillDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            await this._loadSkill(entry.name, path.join(skillDir, entry.name));
          }
        }
      } catch {
        // Directory doesn't exist — skip silently
      }
    }
    return this.skills;
  }

  async _loadSkill(name, skillPath) {
    const skillFile = path.join(skillPath, 'SKILL.md');
    try {
      const content = await fs.readFile(skillFile, 'utf8');
      const meta = this._parseFrontmatter(content);
      const body = this._stripFrontmatter(content);

      // Load configuration
      let config = { enabled: true };
      try {
        const cfgPath = path.join(skillPath, 'skill.json');
        const cfgRaw = await fs.readFile(cfgPath, 'utf8');
        config = { ...config, ...JSON.parse(cfgRaw) };
      } catch {
        // No skill.json — use defaults
      }

      this.skills.set(name, {
        name: meta.name || name,
        description: meta.description || '',
        version: meta.version || '1.0.0',
        tags: meta.tags || [],
        author: meta.author || '',
        skillType: meta.skillType || 'general',
        enabled: config.enabled !== false,
        path: skillPath,
        instructions: body.trim(),
        config,
      });
    } catch {
      // SKILL.md not found or unreadable — skip
    }
  }

  _parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return {};
    const yaml = match[1];
    const meta = {};
    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      // Parse arrays: [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
      } else {
        meta[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
    return meta;
  }

  _stripFrontmatter(content) {
    return content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  getSkill(name) {
    return this.skills.get(name);
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }

  async getSkillByName(name) {
    await this.discoverSkills();
    // Try exact match first
    if (this.skills.has(name)) return this.skills.get(name);
    // Fall back to case-insensitive match
    for (const [, skill] of this.skills) {
      if (skill.name.toLowerCase() === name.toLowerCase()) return skill;
    }
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Skill execution engine
// ════════════════════════════════════════════════════════════════════════════

/**
 * Execute a skill based on its skillType.
 *
 * @param {object} skill - The loaded skill object
 * @param {object} context - Execution context { projectPath, stdout, llmOrchestrator }
 */
export async function executeSkill(skill, context = {}) {
  const { stdout = process.stdout, projectPath = process.cwd() } = context;

  stdout.write(`\n  ${chalk.cyan('▶')} Executing skill: ${chalk.bold(skill.name)} v${skill.version}\n`);
  stdout.write(`  ${chalk.gray(skill.description)}\n`);
  stdout.write(`  ${chalk.gray('Type:')} ${skill.skillType}\n\n`);

  switch (skill.skillType) {
  case 'review':
    return executeReviewSkill(skill, context);
  case 'harness':
    return executeHarnessSkill(skill, context);
  case 'loop':
    return executeLoopSkill(skill, context);
  default:
    return executeGeneralSkill(skill, context);
  }
}

/**
 * Review-type skill: pipe skill instructions + code context to the LLM.
 */
async function executeReviewSkill(skill, context) {
  const { stdout = process.stdout } = context;

  stdout.write(`  ${chalk.cyan('⟳')} Gathering code context (git diff)...\n`);

  let diffContext = '';
  try {
    const { execSync } = await import('child_process');
    // Cross-platform git commands — catch errors silently if not in a git repo
    const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] };
    const files = execSync('git rev-parse --is-inside-work-tree', opts).toString().trim();
    if (files === 'true') {
      const stat = execSync('git diff HEAD~1 --stat', opts).toString().trim();
      const diff = execSync('git diff HEAD~1', opts).toString().trim();
      const changed = execSync('git diff --name-only HEAD~1', opts).toString().trim();
      diffContext = `## Files Changed\n${changed || '(no files — full review mode)'}\n\n## Diff Stats\n${stat}\n\n## Diff\n${diff.slice(0, 8000)}`;
    } else {
      diffContext = '(no git context available — not a git repository)';
    }
  } catch {
    diffContext = '(no git context available — running in standalone mode)';
  }

  stdout.write(`  ${chalk.cyan('⟳')} Building review prompt with skill instructions...\n`);

  // Try to use LLMOrchestrator if available in context
  // Instructions go in the system prompt (authoritative role); diff context is the user prompt
  if (context.llmOrchestrator) {
    stdout.write(`  ${chalk.cyan('⟳')} Sending to AI provider...\n\n`);
    try {
      const result = await context.llmOrchestrator.review(diffContext, {
        systemPrompt: `You are following the "${skill.name}" skill workflow.\n\n${skill.instructions}`,
      });

      stdout.write(`  ${chalk.green('✓')} Review complete\n`);
      stdout.write(`  ${chalk.yellow('Issues found:')} ${result.mergedIssues.length}\n\n`);

      if (result.mergedIssues.length > 0) {
        for (const issue of result.mergedIssues) {
          const severityColor = issue.severity === 'critical' ? chalk.red :
            issue.severity === 'high' ? chalk.yellow :
            issue.severity === 'medium' ? chalk.blue : chalk.gray;
          stdout.write(`  ${severityColor('■')} [${issue.severity.toUpperCase()}] ${issue.title}\n`);
          if (issue.file) stdout.write(`    ${chalk.gray('File:')} ${issue.file}${issue.line ? `:${issue.line}` : ''}\n`);
          if (issue.suggestion) stdout.write(`    ${chalk.gray('Fix:')} ${issue.suggestion}\n`);
          stdout.write('\n');
        }
      }
    } catch (err) {
      stdout.write(`  ${chalk.red('✗')} AI review failed: ${err.message}\n`);
      stdout.write(`  ${chalk.gray('Falling back to instruction display...')}\n\n`);
    }
  } else {
    stdout.write(`  ${chalk.yellow('⚠')} No AI provider available — showing skill instructions\n\n`);
  }

  // Always show the full instructions so users can follow them manually
  stdout.write(`  ${chalk.underline('Skill Instructions')}\n\n`);
  stdout.write(`${skill.instructions}\n\n`);
}

/**
 * Harness-type skill: run through checklist criteria and report pass/fail.
 */
async function executeHarnessSkill(skill, context) {
  const { stdout = process.stdout } = context;

  stdout.write(`  ${chalk.cyan('⟳')} Running compliance checks...\n\n`);

  // For harness skills, extract checklist items from the instructions
  const checklistItems = skill.instructions.match(/[-*]\s*\[.?\]\s*.+/g) ||
    skill.instructions.split('\n')
      .filter(l => l.match(/^\d+[.)]\s/) || l.match(/^[-*]\s/))
      .slice(0, 20);

  if (checklistItems.length > 0) {
    stdout.write(`  ${chalk.underline('Checklist')}\n\n`);
    for (const item of checklistItems) {
      const isChecked = item.includes('[x]') || item.includes('[X]');
      const checkChar = isChecked ? chalk.green('✓') : chalk.gray('○');
      const clean = item.replace(/[-*]\s*\[.?\]\s*/, '').replace(/^\d+[.)]\s*/, '');
      stdout.write(`  ${checkChar} ${clean}\n`);
    }
    stdout.write('\n');
  }

  stdout.write(`  ${chalk.yellow('ℹ')} Full harness instructions:\n\n`);
  stdout.write(`${skill.instructions}\n\n`);
}

/**
 * Loop-type skill: display loop configuration and start instructions.
 */
async function executeLoopSkill(skill, context) {
  const { stdout = process.stdout } = context;

  const maxIter = skill.config.maxIterations || 20;
  const completionTag = skill.config.completionTag || 'DONE';

  stdout.write(`  ${chalk.underline('Loop Configuration')}\n\n`);
  stdout.write(`  ${chalk.gray('Max iterations:')} ${maxIter}\n`);
  stdout.write(`  ${chalk.gray('Completion tag:')} ${completionTag}\n`);
  stdout.write(`  ${chalk.gray('Test command:')} ${skill.config.testCommand || '(not configured)'}\n\n`);

  // Look for loop flow diagram or configuration in the instructions
  const flowSection = skill.instructions.match(/## (?:Flow|Loop|Configuration)[\s\S]*?(?=\n## |$)/);
  if (flowSection) {
    stdout.write(`  ${chalk.underline('Flow')}\n\n${flowSection[0]}\n\n`);
  }

  stdout.write(`  ${chalk.yellow('ℹ')} To run this loop in the TUI, use:\n`);
  stdout.write(`  ${chalk.cyan(`    /loop --skill ${skill.name} --max-iter ${maxIter}`)}\n\n`);

  stdout.write(`  ${chalk.yellow('ℹ')} Or follow the manual instructions:\n\n`);
  stdout.write(`${skill.instructions}\n\n`);
}

/**
 * General-type skill: display instructions for manual use.
 */
async function executeGeneralSkill(skill, context) {
  const { stdout = process.stdout } = context;
  stdout.write(`  ${chalk.yellow('ℹ')} "${skill.name}" is a general-purpose skill.\n`);
  stdout.write(`  ${chalk.gray('Follow the instructions below:\n\n')}`);
  stdout.write(`${skill.instructions}\n\n`);
}

// ════════════════════════════════════════════════════════════════════════════
// CLI command handler
// ════════════════════════════════════════════════════════════════════════════

export async function runSkillCommand(args, options = {}) {
  const manager = new SkillManager(options);
  const stdout = options.stdout || process.stdout;
  const action = args[0] || 'list';

  switch (action) {
  case 'list': {
    await manager.discoverSkills();
    const skills = manager.getAllSkills();
    stdout.write(chalk.cyan('\n  Available Skills:\n'));
    if (skills.length === 0) {
      stdout.write(chalk.gray('    No skills installed\n'));
    } else {
      // Group by skillType
      const grouped = {};
      for (const skill of skills) {
        const type = skill.skillType;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(skill);
      }
      for (const [type, typeSkills] of Object.entries(grouped)) {
        stdout.write(`\n  ${chalk.underline(type)}:\n`);
        for (const skill of typeSkills) {
          const status = skill.enabled ? chalk.green('✓') : chalk.red('✗');
          stdout.write(`    ${status} ${chalk.bold(skill.name)} v${skill.version}\n`);
          stdout.write(`      ${chalk.gray(skill.description)}\n`);
        }
      }
    }
    stdout.write('\n');
    break;
  }

  case 'install': {
    const name = args[1];
    if (!name) {
      stdout.write(chalk.red('  Usage: sentinel skill install <name>\n'));
      stdout.write(chalk.gray('    Install a skill by cloning from a remote source.\n'));
      return;
    }
    stdout.write(chalk.yellow(`  ⚠ Remote skill install not yet implemented for "${name}".\n`));
    stdout.write(chalk.gray('    Skills can be created locally with:\n'));
    stdout.write(chalk.cyan('      sentinel skill create <name>\n'));
    break;
  }

  case 'create': {
    const name = args[1];
    if (!name) {
      stdout.write(chalk.red('  Usage: sentinel skill create <name> [--type review|harness|loop]\n'));
      return;
    }
    const skillType = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'general';
    const validTypes = ['review', 'harness', 'loop', 'general'];
    if (!validTypes.includes(skillType)) {
      stdout.write(chalk.red(`  Invalid type: ${skillType}. Valid: ${validTypes.join(', ')}\n`));
      return;
    }

    const skillsDir = path.join(options.projectPath || process.cwd(), '.sentinel', 'skills', name);
    try {
      await fs.mkdir(skillsDir, { recursive: true });
    } catch (e) {
      stdout.write(chalk.red(`  ✗ Skill directory already exists: ${name}\n`));
      return;
    }

    const skillJson = JSON.stringify({ enabled: true }, null, 2);
    await fs.writeFile(path.join(skillsDir, 'skill.json'), skillJson);

    const skillMd = `---
name: ${name}
description: Custom ${skillType} skill
tags: [custom]
version: 1.0.0
author: sentinel
skillType: ${skillType}
---

# ${name}

> Describe what this skill does.

## When to Use

<!-- Add usage guidance -->

## Instructions

${skillType === 'review'
  ? 'Review the code for security and quality issues.\n\n## Checklist\n\n- [ ] Check for injection flaws\n- [ ] Check for authentication issues\n- [ ] Check for XSS'
  : skillType === 'harness'
    ? 'Run the compliance checklist.\n\n## Criteria\n\n1. First check item\n2. Second check item\n3. Third check item'
    : skillType === 'loop'
      ? 'Automated iterative workflow.\n\n## Configuration\n\n- maxIterations: 20\n- completionTag: DONE\n\n## Steps\n\n1. First step\n2. Second step\n3. Repeat until DONE'
      : 'Describe the task here.'}

## Version History

- 1.0.0 — Initial skill
`;
    await fs.writeFile(path.join(skillsDir, 'SKILL.md'), skillMd);

    stdout.write(chalk.green(`  ✓ Skill "${name}" created (type: ${skillType})\n`));
    stdout.write(chalk.gray(`    ${skillsDir}\n`));
    break;
  }

  case 'enable': {
    const name = args[1];
    if (!name) {
      stdout.write(chalk.red('  Usage: sentinel skill enable <name>\n'));
      return;
    }
    const skill = await manager.getSkillByName(name);
    if (!skill) {
      stdout.write(chalk.red(`  ✗ Skill not found: ${name}\n`));
      return;
    }
    const cfgPath = path.join(skill.path, 'skill.json');
    const cfg = skill.config;
    cfg.enabled = true;
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    stdout.write(chalk.green(`  ✓ Skill "${skill.name}" enabled\n`));
    break;
  }

  case 'disable': {
    const name = args[1];
    if (!name) {
      stdout.write(chalk.red('  Usage: sentinel skill disable <name>\n'));
      return;
    }
    const skill = await manager.getSkillByName(name);
    if (!skill) {
      stdout.write(chalk.red(`  ✗ Skill not found: ${name}\n`));
      return;
    }
    const cfgPath = path.join(skill.path, 'skill.json');
    const cfg = skill.config;
    cfg.enabled = false;
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    stdout.write(chalk.green(`  ✓ Skill "${skill.name}" disabled\n`));
    break;
  }

  case 'run': {
    const name = args[1];
    if (!name) {
      stdout.write(chalk.red('  Usage: sentinel skill run <name> [--llm]\n'));
      stdout.write(chalk.gray('    Run a skill by name. Use --llm to attempt AI-assisted execution.\n'));
      return;
    }
    const skill = await manager.getSkillByName(name);
    if (!skill) {
      stdout.write(chalk.red(`  ✗ Skill not found: "${name}"\n`));
      stdout.write(chalk.gray('    Use "sentinel skill list" to see available skills.\n'));
      return;
    }
    if (!skill.enabled) {
      stdout.write(chalk.yellow(`  ⚠ Skill "${skill.name}" is disabled. Enable it first:\n`));
      stdout.write(chalk.cyan(`    sentinel skill enable ${name}\n`));
      return;
    }

    // Optionally load LLM provider
    let llmOrchestrator = null;
    if (args.includes('--llm')) {
      try {
        const llmMod = await import('../llm/llmOrchestrator.js');
        llmOrchestrator = llmMod.getLLMOrchestrator();
      } catch (e) {
        stdout.write(chalk.yellow(`  ⚠ Could not load LLM provider: ${e.message}\n`));
      }
    }

    await executeSkill(skill, {
      stdout,
      projectPath: options.projectPath || process.cwd(),
      llmOrchestrator,
    });
    break;
  }

  default:
    stdout.write(chalk.gray('  Commands:\n'));
    stdout.write(chalk.gray('    list     - List available skills\n'));
    stdout.write(chalk.gray('    run      - Execute a skill by name\n'));
    stdout.write(chalk.gray('    create   - Create a new skill\n'));
    stdout.write(chalk.gray('    install  - Install a skill from a remote source\n'));
    stdout.write(chalk.gray('    enable   - Enable a skill\n'));
    stdout.write(chalk.gray('    disable  - Disable a skill\n'));
    stdout.write(chalk.gray('\n  Examples:\n'));
    stdout.write(chalk.gray('    sentinel skill list\n'));
    stdout.write(chalk.gray('    sentinel skill run security-review\n'));
    stdout.write(chalk.gray('    sentinel skill run security-review --llm\n'));
    stdout.write(chalk.gray('    sentinel skill create my-custom --type review\n'));
  }

  return manager;
}

export default { SkillManager, executeSkill, runSkillCommand };
