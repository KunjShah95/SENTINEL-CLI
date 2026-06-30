import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createDefaultRegistry, PHASES } from './tool-registry.js';
import { CommentPositionResolver } from '../resolvers/position-resolver.js';
import { getRuleEngine } from '../rules/rule-engine.js';
import { FileReader } from '../git/file-reader.js';

export class ReviewPipeline {
  constructor(options = {}) {
    this.toolRegistry = options.toolRegistry || createDefaultRegistry();
    this.positionResolver = options.positionResolver || new CommentPositionResolver({ llmClient: options.llmClient || null });
    this.ruleEngine = options.ruleEngine || null;
    this.fileReader = options.fileReader || new FileReader();
    this.cwd = options.cwd || process.cwd();
    this.concurrency = options.concurrency || 4;
    this.commentCollector = [];
    this.analyzers = options.analyzers || [];
    this.llmClient = options.llmClient || null;
    // Context engine integrations
    this.guidelinesScanner = options.guidelinesScanner || null;
    this.linkedIssueContext = options.linkedIssueContext || null;
    this.webSearchIntegration = options.webSearchIntegration || null;
    this.activeLearningSystem = options.activeLearningSystem || null;
    this.contextCache = null;
  }

  async initialize() {
    if (!this.ruleEngine) {
      this.ruleEngine = await getRuleEngine();
    }
  }

  async reviewRange(fromRef, toRef, options = {}) {
    this.commentCollector = [];
    const diffOutput = execSync(`git diff ${fromRef}..${toRef} --no-color`, {
      cwd: this.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return await this._processDiff(diffOutput, { ...options, fromRef, toRef });
  }

  async reviewCommit(commitSha, options = {}) {
    this.commentCollector = [];
    const diffOutput = execSync(`git show ${commitSha} --no-color`, {
      cwd: this.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return await this._processDiff(diffOutput, { ...options, commitSha });
  }

  async reviewWorkspace(options = {}) {
    this.commentCollector = [];
    const diffOutput = execSync('git diff HEAD --no-color', {
      cwd: this.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return await this._processDiff(diffOutput, { ...options, workspace: true });
  }

  async _processDiff(diffOutput, context) {
    const fileDiffs = this._splitDiffs(diffOutput);

    const filtered = [];
    for (const fd of fileDiffs) {
      if (this.ruleEngine && !this.ruleEngine.shouldAnalyze(fd.newPath || fd.oldPath)) continue;
      if (fd.isBinary) continue;
      filtered.push(fd);
    }

    const results = [];
    const queue = [...filtered];

    const pools = [];
    for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
      pools.push(this._workerLoop(queue, context, results));
    }
    await Promise.all(pools);

    // Apply learnings to adjust confidence scores
    if (this.activeLearningSystem) {
      try {
        this.commentCollector = this.activeLearningSystem.applyLearnings(this.commentCollector);
        // Remove suppressed issues
        this.commentCollector = this.commentCollector.filter(c => !c.suppressed);
      } catch { /* learnings are optional */ }
    }

    return {
      files: filtered.map(f => ({ oldPath: f.oldPath, newPath: f.newPath, insertions: f.insertions, deletions: f.deletions })),
      comments: this.commentCollector,
      totalIssues: this.commentCollector.length,
    };
  }

  async _workerLoop(queue, context, results) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const result = await this._reviewFile(item, context);
      results.push(result);
    }
  }

  async _reviewFile(fileDiff, context) {
    const filePath = fileDiff.newPath || fileDiff.oldPath;
    const rules = this.ruleEngine ? this.ruleEngine.resolveRules(filePath) : [];

    let fileContent = '';
    try {
      fileContent = await this.fileReader.read(filePath, context.commitSha || null);
    } catch {
      try {
        fileContent = await fs.readFile(path.resolve(this.cwd, filePath), 'utf-8');
      } catch {
        return { file: filePath, error: 'Could not read file', comments: [], commentCount: 0 };
      }
    }

    const fileComments = [];

    // Phase 1: Run registered analyzers
    for (const analyzer of this.analyzers) {
      try {
        analyzer.reset();
        const issues = await analyzer.analyzeFile(filePath, fileContent, {});
        if (!Array.isArray(issues)) continue;
        for (const issue of issues) {
          const resolved = await this.positionResolver.resolveComment(fileDiff.diff, {
            existingCode: issue.snippet || issue.existingCode || issue.message,
            content: issue.message || issue.title,
          });
          fileComments.push({
            path: filePath,
            title: issue.title || issue.name || 'Issue',
            message: issue.message || issue.title,
            severity: issue.severity || 'medium',
            category: issue.category || issue.type || 'quality',
            line: resolved.startLine || issue.line || null,
            endLine: resolved.endLine || null,
            confidence: resolved.confidence || 'medium',
            suggestion: issue.suggestion || null,
          });
        }
      } catch (err) {
        // skip failing analyzer for this file
      }
    }

    // Phase 2: If LLM client available, do deep review per matched rules
    if (this.llmClient && rules.length > 0) {
      try {
        const deepComments = await this._llmDeepReview(filePath, fileContent, fileDiff.diff, rules);
        fileComments.push(...deepComments);
      } catch {
        // deep review is optional
      }
    }

    // Phase 3: Submit all comments through tool registry
    for (const comment of fileComments) {
      try {
        await this.toolRegistry.execute('submit_comment', {
          path: comment.path,
          content: `${comment.title}: ${comment.message}`,
          severity: comment.severity,
          existingCode: comment.snippet || '',
          startLine: comment.line || undefined,
          endLine: comment.endLine || undefined,
        }, { phase: PHASES.MAIN, commentCollector: this.commentCollector });
        this.commentCollector.push(comment);
      } catch {
        // fallback: push directly
        this.commentCollector.push(comment);
      }
    }

    return {
      file: filePath,
      rules: rules.map(r => r.rule),
      comments: fileComments,
      commentCount: fileComments.length,
    };
  }

  async _llmDeepReview(filePath, fileContent, diffText, rules) {
    const ruleDescriptions = rules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n');

    // Gather context from engines (cached per pipeline run)
    let contextBlock = '';
    if (!this.contextCache) {
      this.contextCache = {};
      try {
        if (this.guidelinesScanner) {
          const guidelines = await this.guidelinesScanner.scan();
          if (guidelines.summary) this.contextCache.guidelines = guidelines.summary;
        }
      } catch { /* optional */ }
    }

    if (this.contextCache.guidelines) {
      contextBlock += '\n' + this.contextCache.guidelines.slice(0, 3000) + '\n';
    }

    const prompt = `Review this file for issues relevant to the following rules:

${ruleDescriptions}
${contextBlock}
File: ${filePath}

\`\`\`
${fileContent.slice(0, 8000)}
\`\`\`

${diffText ? `Diff:\n\`\`\`diff\n${diffText.slice(0, 3000)}\n\`\`\`` : ''}

Return findings as JSON array: [{ "severity": "high|medium|low|info", "title": "...", "message": "...", "existingCode": "...", "suggestion": "..." }]
Output ONLY valid JSON, no markdown fences.`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }], { maxTokens: 2000, timeout: 30_000 });
    const text = response.content || response.message?.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    try {
      const findings = JSON.parse(jsonMatch[0]);
      const resolved = [];
      for (const f of findings) {
        const pos = await this.positionResolver.resolveComment(diffText, f);
        resolved.push({
          path: filePath,
          title: f.title || 'Issue',
          message: f.message || f.title,
          severity: f.severity || 'medium',
          category: 'llm-review',
          line: pos.startLine || null,
          endLine: pos.endLine || null,
          confidence: pos.confidence || 'low',
          suggestion: f.suggestion || null,
        });
      }
      return resolved;
    } catch {
      return [];
    }
  }

  _splitDiffs(diffOutput) {
    const files = [];
    const fileRegex = /^diff --git a\/(.+) b\/(.+)$/gm;
    let match;

    while ((match = fileRegex.exec(diffOutput)) !== null) {
      const endIdx = diffOutput.indexOf('diff --git', match.index + 1);
      const content = endIdx === -1 ? diffOutput.slice(match.index) : diffOutput.slice(match.index, endIdx);

      const oldPath = match[1];
      const newPath = match[2];

      const statsLine = content.match(/^(\d+) insertions.*, (\d+) deletions/gm);
      let insertions = 0, deletions = 0;
      if (statsLine) {
        const insMatch = statsLine[0].match(/(\d+) insertions/);
        const delMatch = statsLine[0].match(/(\d+) deletions/);
        if (insMatch) insertions = parseInt(insMatch[1], 10);
        if (delMatch) deletions = parseInt(delMatch[1], 10);
      }

      const isBinary = content.includes('Binary files');
      const isNew = content.includes('new file mode');
      const isDeleted = content.includes('deleted file mode');
      const isRenamed = content.includes('rename from');

      files.push({
        oldPath: oldPath.replace(/^"|"$/g, ''),
        newPath: newPath.replace(/^"|"$/g, ''),
        diff: content,
        isBinary,
        isNew,
        isDeleted,
        isRenamed,
        insertions,
        deletions,
      });
    }

    return files;
  }
}

export async function createReviewPipeline(options = {}) {
  const pipeline = new ReviewPipeline(options);
  await pipeline.initialize();
  return pipeline;
}
