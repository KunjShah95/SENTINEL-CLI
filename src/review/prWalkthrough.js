/**
 * PR Walkthrough Generator
 *
 * Generates structured walkthrough: cohort grouping, layer ordering
 * by dependency, range summaries, effort estimation.
 */

export class PRWalkthrough {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
  }

  /**
   * Generate a PR walkthrough from changed files and review results.
   */
  async generate(changedFiles, reviewResults = {}) {
    const cohorts = this.groupIntoCohorts(changedFiles);
    const effort = this.estimateEffort(changedFiles);
    const summary = await this.generateSummary(changedFiles, cohorts, effort);

    return {
      cohorts,
      effort,
      summary,
      totalFiles: changedFiles.length,
      totalInsertions: changedFiles.reduce((s, f) => s + (f.additions || 0), 0),
      totalDeletions: changedFiles.reduce((s, f) => s + (f.deletions || 0), 0),
    };
  }

  /**
   * Group changed files into logical cohorts.
   */
  groupIntoCohorts(files) {
    const cohortMap = {
      foundation: { name: 'Foundation', description: 'Core models, types, configs', files: [] },
      api: { name: 'API Layer', description: 'Routes, controllers, middleware', files: [] },
      ui: { name: 'UI/Frontend', description: 'Components, styles, templates', files: [] },
      tests: { name: 'Tests', description: 'Unit tests, integration tests, fixtures', files: [] },
      config: { name: 'Configuration', description: 'Config files, env, CI/CD', files: [] },
      docs: { name: 'Documentation', description: 'README, comments, docs', files: [] },
      other: { name: 'Other', description: 'Miscellaneous changes', files: [] },
    };

    for (const file of files) {
      const path = (file.path || '').toLowerCase();

      if (/(test|spec|__tests__|_test|\.test\.|\.spec\.)/.test(path)) {
        cohortMap.tests.files.push(file);
      } else if (/(route|controller|middleware|api|handler)/.test(path)) {
        cohortMap.api.files.push(file);
      } else if (/(component|view|page|screen|template|\.tsx|\.jsx|\.vue|\.svelte)/.test(path)) {
        cohortMap.ui.files.push(file);
      } else if (/(config|\.env|\.yaml|\.yml|\.toml|\.json|dockerfile|ci)/.test(path)) {
        cohortMap.config.files.push(file);
      } else if (/(\.md|docs|README)/.test(path)) {
        cohortMap.docs.files.push(file);
      } else if (/(model|schema|type|interface|entity|migration)/.test(path)) {
        cohortMap.foundation.files.push(file);
      } else {
        cohortMap.other.files.push(file);
      }
    }

    // Filter empty cohorts and order by dependency
    const order = ['foundation', 'api', 'ui', 'config', 'tests', 'docs', 'other'];
    return order
      .filter(key => cohortMap[key].files.length > 0)
      .map(key => ({
        ...cohortMap[key],
        fileCount: cohortMap[key].files.length,
        insertions: cohortMap[key].files.reduce((s, f) => s + (f.additions || 0), 0),
        deletions: cohortMap[key].files.reduce((s, f) => s + (f.deletions || 0), 0),
      }));
  }

  /**
   * Estimate review effort based on changes.
   */
  estimateEffort(files) {
    const totalLines = files.reduce((s, f) => s + (f.additions || 0) + (f.deletions || 0), 0);
    const fileCount = files.length;

    let level, minutes;
    if (totalLines < 50 && fileCount < 3) {
      level = 'trivial'; minutes = 5;
    } else if (totalLines < 200 && fileCount < 8) {
      level = 'small'; minutes = 15;
    } else if (totalLines < 500 && fileCount < 15) {
      level = 'medium'; minutes = 30;
    } else if (totalLines < 1500) {
      level = 'large'; minutes = 60;
    } else {
      level = 'extra-large'; minutes = 120;
    }

    return { level, estimatedMinutes: minutes, totalLines, fileCount };
  }

  /**
   * Generate an LLM-powered summary of the PR.
   */
  async generateSummary(files, cohorts, effort) {
    if (!this.llmClient) {
      return this.generateStaticSummary(files, cohorts, effort);
    }

    try {
      const fileList = files.slice(0, 20).map(f => `${f.path} (+${f.additions || 0}/-${f.deletions || 0})`).join('\n');
      const prompt = `Generate a concise PR walkthrough summary:

Files changed: ${files.length}
Insertions: ${files.reduce((s, f) => s + (f.additions || 0), 0)}
Deletions: ${files.reduce((s, f) => s + (f.deletions || 0), 0)}

Changed files:
${fileList}

Cohorts: ${cohorts.map(c => `${c.name} (${c.fileCount} files)`).join(', ')}

Write a 3-5 sentence summary describing what this PR does, the main areas affected, and any notable patterns. Keep it professional.`;

      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 500, timeout: 15_000 }
      );

      return response.content || response.message?.content || this.generateStaticSummary(files, cohorts, effort);
    } catch {
      return this.generateStaticSummary(files, cohorts, effort);
    }
  }

  generateStaticSummary(files, cohorts, effort) {
    const insertions = files.reduce((s, f) => s + (f.additions || 0), 0);
    const deletions = files.reduce((s, f) => s + (f.deletions || 0), 0);

    return `This PR modifies ${files.length} file(s) across ${cohorts.length} area(s) (${cohortNames(cohorts)}). ` +
      `Total changes: +${insertions}/-${deletions} lines. ` +
      `Estimated review effort: ${effort.level} (~${effort.estimatedMinutes} min).`;
  }

  /**
   * Format walkthrough as a PR comment.
   */
  formatAsComment(walkthrough) {
    let body = '## 🛡️ Sentinel PR Walkthrough\n\n';
    body += `${walkthrough.summary}\n\n`;
    body += `**Effort:** ${walkthrough.effort.level} (~${walkthrough.effort.estimatedMinutes} min) | `;
    body += `**Files:** ${walkthrough.totalFiles} | `;
    body += `**Changes:** +${walkthrough.totalInsertions}/-${walkthrough.totalDeletions}\n\n`;

    body += '### Change Cohorts\n\n';
    for (const cohort of walkthrough.cohorts) {
      body += `<details><summary><strong>${cohort.name}</strong> (${cohort.fileCount} files, +${cohort.insertions}/-${cohort.deletions})</summary>\n\n`;
      for (const file of cohort.files.slice(0, 10)) {
        body += `- \`${file.path}\` (+${file.additions || 0}/-${file.deletions || 0})\n`;
      }
      if (cohort.files.length > 10) body += `- _... and ${cohort.files.length - 10} more_\n`;
      body += '\n</details>\n\n';
    }

    body += '---\n_Powered by [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI)_';
    return body;
  }
}

function cohortNames(cohorts) {
  return cohorts.map(c => c.name).join(', ');
}

export default PRWalkthrough;
