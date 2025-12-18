import { promises as fs } from 'fs';

/**
 * Issue Suppression Handler
 * Handles inline comments for suppressing Sentinel issues
 * 
 * Supported formats:
 * - // sentinel-ignore-next-line [rule-id]
 * - // sentinel-ignore-line [rule-id]
 * - /* sentinel-ignore-file [rule-id] *\/
 * - // sentinel-disable [rule-id]
 * - // sentinel-enable [rule-id]
 * - # sentinel-ignore (for YAML/Python)
 */
export class IssueSuppression {
  constructor() {
    this.suppressionPatterns = {
      // JavaScript/TypeScript style
      ignoreNextLine: /\/\/\s*sentinel-ignore-next-line(?:\s+([\w\-,/ ]+))?/i,
      ignoreLine: /\/\/\s*sentinel-ignore-line(?:\s+([\w\-,/ ]+))?/i,
      ignoreFile: /\/\*\s*sentinel-ignore-file(?:\s+([\w\-,/ ]+))?\s*\*\//i,
      disableBlock: /\/\/\s*sentinel-disable(?:\s+([\w\-,/ ]+))?/i,
      enableBlock: /\/\/\s*sentinel-enable(?:\s+([\w\-,/ ]+))?/i,
      // Python/YAML style
      hashIgnoreNextLine: /#\s*sentinel-ignore-next-line(?:\s+([\w\-,/ ]+))?/i,
      hashIgnoreLine: /#\s*sentinel-ignore(?:\s+([\w\-,/ ]+))?/i,
      // HTML comment style
      htmlIgnore: /<!--\s*sentinel-ignore(?:\s+([\w\-,/ ]+))?\s*-->/i,
    };
  }

  /**
   * Parse suppression comments from file content
   * Returns a map of line numbers to suppressed rule IDs
   */
  parseSuppressions(content, _filePath) {
    const suppressions = {
      file: [],          // Rules suppressed for entire file
      lines: new Map(),  // line number -> [rule IDs]
      ranges: [],        // { start, end, rules }
    };

    const lines = content.split('\n');
    let blockDisabled = null; // Currently disabled rules in a block

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for file-level suppression
      const fileMatch = line.match(this.suppressionPatterns.ignoreFile);
      if (fileMatch) {
        const rules = this.parseRuleIds(fileMatch[1]);
        suppressions.file.push(...rules);
        continue;
      }

      // Check for block disable
      const disableMatch = line.match(this.suppressionPatterns.disableBlock);
      if (disableMatch) {
        const rules = this.parseRuleIds(disableMatch[1]);
        blockDisabled = { start: lineNum, rules };
        continue;
      }

      // Check for block enable
      const enableMatch = line.match(this.suppressionPatterns.enableBlock);
      if (enableMatch && blockDisabled) {
        suppressions.ranges.push({
          start: blockDisabled.start,
          end: lineNum,
          rules: blockDisabled.rules,
        });
        blockDisabled = null;
        continue;
      }

      // Check for next-line suppression
      const nextLinePatterns = [
        this.suppressionPatterns.ignoreNextLine,
        this.suppressionPatterns.hashIgnoreNextLine,
      ];
      for (const pattern of nextLinePatterns) {
        const match = line.match(pattern);
        if (match) {
          const rules = this.parseRuleIds(match[1]);
          const targetLine = lineNum + 1;
          if (!suppressions.lines.has(targetLine)) {
            suppressions.lines.set(targetLine, []);
          }
          suppressions.lines.get(targetLine).push(...rules);
          break;
        }
      }

      // Check for same-line suppression
      const sameLinePatterns = [
        this.suppressionPatterns.ignoreLine,
        this.suppressionPatterns.hashIgnoreLine,
        this.suppressionPatterns.htmlIgnore,
      ];
      for (const pattern of sameLinePatterns) {
        const match = line.match(pattern);
        if (match) {
          const rules = this.parseRuleIds(match[1]);
          if (!suppressions.lines.has(lineNum)) {
            suppressions.lines.set(lineNum, []);
          }
          suppressions.lines.get(lineNum).push(...rules);
          break;
        }
      }
    }

    // Close any unclosed block
    if (blockDisabled) {
      suppressions.ranges.push({
        start: blockDisabled.start,
        end: lines.length,
        rules: blockDisabled.rules,
      });
    }

    return suppressions;
  }

  /**
   * Parse rule IDs from suppression comment
   */
  parseRuleIds(ruleString) {
    if (!ruleString || ruleString.trim() === '') {
      return ['*']; // Suppress all rules
    }
    return ruleString
      .split(/[,\s]+/)
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Check if an issue should be suppressed
   */
  isIssueSuppressed(issue, suppressions) {
    const { file, lines, ranges } = suppressions;
    const issueRuleId = (issue.id || '').toLowerCase();
    const issueLine = issue.line || 1;

    // Check file-level suppressions
    if (file.length > 0) {
      if (file.includes('*') || file.some(r => this.ruleMatches(r, issueRuleId))) {
        return { suppressed: true, reason: 'file-level suppression' };
      }
    }

    // Check line-level suppressions
    if (lines.has(issueLine)) {
      const lineRules = lines.get(issueLine);
      if (lineRules.includes('*') || lineRules.some(r => this.ruleMatches(r, issueRuleId))) {
        return { suppressed: true, reason: 'line-level suppression' };
      }
    }

    // Check range suppressions
    for (const range of ranges) {
      if (issueLine >= range.start && issueLine <= range.end) {
        if (range.rules.includes('*') || range.rules.some(r => this.ruleMatches(r, issueRuleId))) {
          return { suppressed: true, reason: 'block suppression' };
        }
      }
    }

    return { suppressed: false };
  }

  /**
   * Check if a suppression rule matches an issue rule ID
   */
  ruleMatches(suppressionRule, issueRuleId) {
    if (suppressionRule === '*') return true;
    
    // Exact match
    if (suppressionRule === issueRuleId) return true;

    // Category match (e.g., "security" matches "security/sql-injection")
    if (issueRuleId.startsWith(`${suppressionRule}/`) || issueRuleId === suppressionRule) return true;

    // Support partial matches and common separators
    if (issueRuleId.includes(suppressionRule + '/')) return true;

    return false;
  }

  /**
   * Load suppressions directly from a file
   */
  async loadSuppressionsFromFile(filePath) {
    try {
      const path = await import('path');
      
      // Validate and sanitize file path
      const normalizedPath = path.normalize(filePath);
      if (normalizedPath.includes('..')) {
        throw new Error('Path traversal detected');
      }
      
      const fileContent = await fs.readFile(normalizedPath, 'utf8');
      return this.parseSuppressions(fileContent, normalizedPath);
    } catch (error) {
      return { file: [], lines: new Map(), ranges: [] };
    }
  }
}

export default IssueSuppression;

