export class CommentPositionResolver {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.maxFallbackAttempts = options.maxFallbackAttempts || 1;
  }

  async resolveComment(diffText, comment) {
    const hunks = this._parseHunks(diffText);
    const newLines = this._extractNewLines(hunks);
    const oldLines = this._extractOldLines(hunks);

    const existingCode = (comment.existingCode || comment.content || '').trim();
    if (!existingCode) {
      return { startLine: null, endLine: null, confidence: 'none', method: 'empty' };
    }

    let match = this._matchLines(existingCode, newLines);
    if (match) {
      return { startLine: match.startLine, endLine: match.endLine, confidence: 'high', method: 'new-side' };
    }

    match = this._matchLines(existingCode, oldLines);
    if (match) {
      return { startLine: match.startLine, endLine: match.endLine, confidence: 'high', method: 'old-side' };
    }

    if (this.llmClient && this.maxFallbackAttempts > 0) {
      return await this._llmRelocation(diffText, comment, existingCode);
    }

    return { startLine: null, endLine: null, confidence: 'none', method: 'failed' };
  }

  _parseHunks(diffText) {
    const hunks = [];
    const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match;

    while ((match = hunkRegex.exec(diffText)) !== null) {
      const hunkStart = match.index;
      const nextHunkMatch = hunkRegex.exec(diffText);
      const hunkEnd = nextHunkMatch ? nextHunkMatch.index : diffText.length;
      hunkRegex.lastIndex = nextHunkMatch ? nextHunkMatch.index : diffText.length;

      const hunkText = diffText.slice(hunkStart, hunkEnd);
      const lines = hunkText.split('\n').slice(1);

      const hunk = {
        oldStart: parseInt(match[1], 10),
        oldCount: parseInt(match[2] || '1', 10),
        newStart: parseInt(match[3], 10),
        newCount: parseInt(match[4] || '1', 10),
        lines: [],
      };

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const line of lines) {
        if (line.startsWith(' ')) {
          hunk.lines.push({ type: 'context', content: line.slice(1), oldLine, newLine });
          oldLine++;
          newLine++;
        } else if (line.startsWith('+')) {
          hunk.lines.push({ type: 'added', content: line.slice(1), oldLine: null, newLine });
          newLine++;
        } else if (line.startsWith('-')) {
          hunk.lines.push({ type: 'deleted', content: line.slice(1), oldLine, newLine: null });
          oldLine++;
        }
      }

      hunks.push(hunk);
    }

    return hunks;
  }

  _extractNewLines(hunks) {
    const lines = [];
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'context' || line.type === 'added') {
          lines.push({ content: line.content, lineNumber: line.newLine });
        }
      }
    }
    return lines;
  }

  _extractOldLines(hunks) {
    const lines = [];
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'context' || line.type === 'deleted') {
          lines.push({ content: line.content, lineNumber: line.oldLine });
        }
      }
    }
    return lines;
  }

  _matchLines(existingCode, fileLines) {
    const needle = existingCode.split('\n').map(l => this._normalize(l));
    if (needle.length === 0) return null;

    const minMatch = needle.filter(l => l.length > 0).length;
    if (minMatch === 0) return null;

    for (let i = 0; i <= fileLines.length - needle.length; i++) {
      let matches = 0;
      for (let j = 0; j < needle.length; j++) {
        if (needle[j].length > 0 && this._normalize(fileLines[i + j].content) === needle[j]) {
          matches++;
        }
      }

      if (matches >= minMatch) {
        return {
          startLine: fileLines[i].lineNumber,
          endLine: fileLines[i + needle.length - 1].lineNumber,
          matchScore: matches / needle.length,
        };
      }
    }

    for (let i = 0; i < fileLines.length; i++) {
      if (this._normalize(fileLines[i].content) === needle[0]) {
        const endIdx = Math.min(i + needle.length - 1, fileLines.length - 1);
        return {
          startLine: fileLines[i].lineNumber,
          endLine: fileLines[endIdx].lineNumber,
          matchScore: 0.3,
        };
      }
    }

    return null;
  }

  async _llmRelocation(diffText, originalComment, existingCode) {
    try {
      const prompt = `I have a code review comment that references this code snippet:

\`\`\`
${existingCode.slice(0, 1000)}
\`\`\`

And here is the git diff:

\`\`\`diff
${diffText.slice(0, 4000)}
\`\`\`

Find the exact code snippet from the diff (the new version of the file). Return ONLY the matched code snippet inside a code block. If you cannot find it, return "NOT FOUND".`;

      const result = await this.llmClient.chat([{ role: 'user', content: prompt }], { maxTokens: 500, timeout: 60_000 });
      const response = result.content || result.message?.content || '';
      const codeMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch) {
        const correctedCode = codeMatch[1].trim();
        const hunks = this._parseHunks(diffText);
        const newLines = this._extractNewLines(hunks);
        const match = this._matchLines(correctedCode, newLines);
        if (match) {
          return { ...match, confidence: 'medium', method: 'llm-relocation' };
        }
      }
      return { startLine: null, endLine: null, confidence: 'low', method: 'llm-failed' };
    } catch {
      return { startLine: null, endLine: null, confidence: 'low', method: 'llm-error' };
    }
  }

  _normalize(line) {
    return line.trim().replace(/\s+/g, ' ');
  }
}

export function createPositionResolver(llmClient) {
  return new CommentPositionResolver({ llmClient });
}
