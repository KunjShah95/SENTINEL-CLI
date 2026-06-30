import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_PATTERNS_PATH = join(import.meta.dirname, 'patterns.json');
const CUSTOM_RULES_PATH = join(homedir(), '.sentinel', 'rules', 'security-rules.json');

/**
 * Security Knowledge Base
 * Loaded patterns from OWASP, CWE, and custom rules
 */
export class SecurityKnowledgeBase {
  patterns = [];
  customRules = [];

  constructor() {
    this.loadPatterns();
    this.loadCustomRules();
  }

  loadPatterns() {
    try {
      const data = readFileSync(DEFAULT_PATTERNS_PATH, 'utf-8');
      const json = JSON.parse(data);
      this.patterns = json.patterns || [];
    } catch (e) {
      console.warn('Failed to load default security patterns:', e.message);
      this.patterns = [];
    }
  }

  loadCustomRules() {
    if (existsSync(CUSTOM_RULES_PATH)) {
      try {
        const data = readFileSync(CUSTOM_RULES_PATH, 'utf-8');
        const json = JSON.parse(data);
        this.customRules = json.patterns || [];
      } catch (e) {
        console.warn('Failed to load custom security rules:', e.message);
        this.customRules = [];
      }
    }
  }

  /**
   * Get all patterns as context for AI review
   */
  getAllPatterns() {
    return [...this.patterns, ...this.customRules];
  }

  /**
   * Find patterns relevant to specific code changes
   * @param {string} filePath - File being reviewed
   * @param {string} content - File content for keyword matching
   * @returns {Array}
   */
  findRelevantPatterns(filePath, content = '') {
    const relevant = [];
    const allPatterns = this.getAllPatterns();
    const lowerContent = content.toLowerCase();
    const lowerPath = filePath.toLowerCase();

    for (const pattern of allPatterns) {
      // Match by category keywords in content
      const keywords = [pattern.category.toLowerCase()];
      const typeMatch = /OWASP-(\d+)|CWE-(\d+)/.test(pattern.type || '');
      
      if (typeMatch && lowerContent.includes(keywords[0])) {
        relevant.push(pattern);
      }

      // Match by file type
      if (pattern.category === 'Injection' && /\.(ts|js|py|rb|php)$/.test(filePath)) {
        relevant.push(pattern);
      }
      if (pattern.category === 'CWE-798' && /\.(env|config|settings)$/.test(filePath)) {
        relevant.push(pattern);
      }
    }

    return relevant;
  }

  /**
   * Get patterns grouped by severity (highest first)
   */
  getPatternsBySeverity() {
    const patterns = this.getAllPatterns();
    return patterns.sort((a, b) => {
      const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (severityOrder[a.severity || 'Medium'] || 4) - (severityOrder[b.severity || 'Medium'] || 4);
    });
  }

  /**
   * Format patterns as specialist guidelines for AI prompt injection
   * @param {Array} patterns
   * @returns {string}
   */
  formatAsGuidelines(patterns) {
    if (!patterns.length) return '';

    const lines = ['\n### Security Specialist Guidelines (OWASP Top 10 + CWE):', ''];
    for (const p of patterns) {
      lines.push(`- **${p.category}: ${p.title}** (${p.severity}) ${p.type}`);
      lines.push(`  - Look for: ${p.symptoms?.join(', ') || 'generic security issue'}`);
      if (p.remediation) {
        lines.push(`  - Fix: ${p.remediation}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get OWASP Top 10 checklist for review summary
   */
  getOWASPTop10Checklist() {
    return [
      '[ ] Injection (SQL, NoSQL, OS command)',
      '[ ] Broken Authentication',
      '[ ] Sensitive Data Exposure',
      '[ ] XML External Entities (XXE)',
      '[ ] Broken Access Control',
      '[ ] Security Misconfiguration',
      '[ ] Cross-Site Scripting (XSS)',
      '[ ] Insecure Deserialization',
      '[ ] Using Components with Known Vulnerabilities',
      '[ ] Insufficient Logging & Monitoring',
    ].join('\n');
  }

  /**
   * Invalidate cache and reload patterns
   */
  refresh() {
    this.loadPatterns();
    this.loadCustomRules();
  }
}

// Singleton instance
let kbInstance = null;
export function getKnowledgeBase() {
  if (!kbInstance) {
    kbInstance = new SecurityKnowledgeBase();
  }
  return kbInstance;
}

export async function injectKnowledgeIntoPrompt(promptTemplate, context) {
  const kb = getKnowledgeBase();
  const patterns = kb.findRelevantPatterns(context.filePath, context.fileContent);
  
  if (patterns.length) {
    return promptTemplate + kb.formatAsGuidelines(patterns);
  }
  
  return promptTemplate;
}