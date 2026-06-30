/**
 * Positioning Module — ensures LLM-generated review comments are placed
 * at the correct line numbers.
 *
 * Inspired by open-code-review's "External Positioning Module" that corrects
 * the common problem of LLM position drift, where reported issue locations
 * don't match the actual code.
 */

import { readFileSync, existsSync } from 'node:fs';

export class PositioningModule {
  /**
   * @param {object} [options]
   * @param {number} [options.contextLines=3] — lines of context to verify position
   * @param {number} [options.maxLineDrift=2] — max lines a comment can be off before correction
   */
  constructor(options = {}) {
    this.contextLines = options.contextLines || 3;
    this.maxLineDrift = options.maxLineDrift || 2;
  }

  /**
   * Verify and correct a comment's position.
   * @param {object} issue — { file, line, snippet, message, title }
   * @param {object} [options]
   * @param {object} [options.fileContent] — pre-read file content (avoids re-reading)
   * @returns {{ issue: object, adjusted: boolean, originalLine: number, confidence: number }}
   */
  position(issue, options = {}) {
    const content = options.fileContent || this._readFile(issue.file);
    if (!content) {
      return { issue, adjusted: false, originalLine: issue.line, confidence: 0 };
    }

    const lines = content.split('\n');
    const originalLine = issue.line;
    const snippet = issue.snippet || '';

    // If there's no snippet, no adjustment needed
    if (!snippet) {
      return { issue, adjusted: false, originalLine, confidence: 1 };
    }

    // Search for the snippet near the reported line
    const result = this._findSnippet(lines, snippet, originalLine);

    if (result.found) {
      return {
        issue: { ...issue, line: result.line },
        adjusted: result.line !== originalLine,
        originalLine,
        confidence: result.confidence,
        matchType: result.matchType,
      };
    }

    // Snippet not found — try a looser match
    const fuzzyResult = this._fuzzySearch(lines, snippet);
    if (fuzzyResult) {
      return {
        issue: { ...issue, line: fuzzyResult.line },
        adjusted: true,
        originalLine,
        confidence: fuzzyResult.confidence,
        matchType: 'fuzzy',
      };
    }

    // Could not find the snippet — keep original position but mark low confidence
    return {
      issue,
      adjusted: false,
      originalLine,
      confidence: 0.3,
      matchType: 'not_found',
    };
  }

  /**
   * Position multiple issues in batch.
   */
  positionAll(issues, options = {}) {
    // Group by file to avoid re-reading
    const fileContents = new Map();

    return issues.map(issue => {
      if (!fileContents.has(issue.file)) {
        const content = options.fileContent?.[issue.file] || this._readFile(issue.file);
        fileContents.set(issue.file, content);
      }
      return this.position(issue, {
        ...options,
        fileContent: fileContents.get(issue.file),
      });
    });
  }

  /**
   * Calculate the offset between an issue's reported line and its actual line.
   */
  calculateDrift(issue, fileContent) {
    const result = this.position(issue, { fileContent });
    return {
      drift: result.adjusted ? result.originalLine - result.issue.line : 0,
      correctedLine: result.issue.line,
      confidence: result.confidence,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _readFile(filePath) {
    try {
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8');
      }
    } catch { /* file not accessible */ }
    return null;
  }

  _findSnippet(lines, snippet, hintLine) {
    const snippetLines = snippet.split('\n').filter(s => s.trim()).length || 1;
    const searchLines = snippet.trim();

    if (!searchLines) return { found: false };

    // Search in a window around the hint line
    const start = Math.max(0, hintLine - this.contextLines - 1);
    const end = Math.min(lines.length, hintLine + this.contextLines + snippetLines);

    // Exact match first
    for (let i = start; i < end; i++) {
      if (lines[i] && lines[i].trim().includes(searchLines)) {
        return { found: true, line: i + 1, confidence: 1, matchType: 'exact' };
      }
    }

    // Partial match on each line
    const searchWords = searchLines.split(/\s+/).filter(w => w.length > 3);
    if (searchWords.length === 0) return { found: false };

    for (let i = start; i < end; i++) {
      if (!lines[i]) continue;
      const matchCount = searchWords.filter(w => lines[i].includes(w)).length;
      const ratio = matchCount / searchWords.length;
      if (ratio >= 0.6) {
        return { found: true, line: i + 1, confidence: ratio, matchType: 'partial' };
      }
    }

    return { found: false };
  }

  _fuzzySearch(lines, snippet) {
    const searchWords = snippet.trim().split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      const matchCount = searchWords.filter(w => lines[i].includes(w)).length;
      const score = matchCount / searchWords.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { line: i + 1, confidence: score };
      }
    }

    return bestScore > 0.4 ? bestMatch : null;
  }
}

export default PositioningModule;
