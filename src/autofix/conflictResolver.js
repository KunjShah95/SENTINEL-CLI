/**
 * Conflict Resolver
 *
 * Parses merge conflict markers and uses LLM to resolve conflicts.
 */

const CONFLICT_PATTERN = /<<<<<<<\s*(\S+)\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>\s*(\S+)\n/g;

export class ConflictResolver {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
  }

  /**
   * Detect merge conflicts in content.
   */
  hasConflicts(content) {
    return CONFLICT_PATTERN.test(content);
  }

  /**
   * Extract conflict blocks from content.
   */
  extractConflicts(content) {
    const conflicts = [];
    let match;
    const pattern = new RegExp(CONFLICT_PATTERN.source, 'g');

    while ((match = pattern.exec(content)) !== null) {
      conflicts.push({
        currentBranch: match[1],
        currentContent: match[2],
        incomingContent: match[3],
        incomingBranch: match[4],
        fullMatch: match[0],
        index: match.index,
      });
    }

    return conflicts;
  }

  /**
   * Resolve all conflicts in content.
   */
  async resolve(content) {
    const conflicts = this.extractConflicts(content);
    if (conflicts.length === 0) {
      return { resolved: content, conflicts: 0 };
    }

    let resolved = content;
    const resolutions = [];

    for (const conflict of conflicts) {
      let resolution;

      if (this.llmClient) {
        resolution = await this.resolveWithLLM(conflict);
      } else {
        // Default: keep current branch content
        resolution = conflict.currentContent;
      }

      resolutions.push({
        currentBranch: conflict.currentBranch,
        incomingBranch: conflict.incomingBranch,
        resolution: typeof resolution === 'string' ? resolution : resolution.content,
        strategy: typeof resolution === 'string' ? 'current' : resolution.strategy,
      });

      const resolvedContent = typeof resolution === 'string' ? resolution : resolution.content;
      resolved = resolved.replace(conflict.fullMatch, resolvedContent);
    }

    return {
      resolved,
      conflicts: conflicts.length,
      resolutions,
    };
  }

  /**
   * Resolve a single conflict using LLM.
   */
  async resolveWithLLM(conflict) {
    try {
      const prompt = `Resolve this merge conflict between ${conflict.currentBranch} and ${conflict.incomingBranch}:

Current (${conflict.currentBranch}):
\`\`\`
${conflict.currentContent}
\`\`\`

Incoming (${conflict.incomingBranch}):
\`\`\`
${conflict.incomingContent}
\`\`\`

Provide the merged resolution that preserves the intent of both changes.
Return ONLY the resolved code, no explanations or markdown fences.`;

      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 2000, timeout: 15_000 }
      );

      const resolvedContent = (response.content || response.message?.content || '')
        .replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

      return {
        content: resolvedContent || conflict.currentContent,
        strategy: 'llm-merge',
      };
    } catch {
      return {
        content: conflict.currentContent,
        strategy: 'current-fallback',
      };
    }
  }
}

export default ConflictResolver;
