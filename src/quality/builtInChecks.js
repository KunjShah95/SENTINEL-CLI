/**
 * Built-In Quality Checks
 *
 * Docstring coverage, PR title pattern, PR description template, issue assessment.
 */

const DOC_COMMENT_PATTERNS = [
  /\/\*\*[\s\S]*?\*\//,     // JSDoc/Javadoc
  /\/\/\/\s/,               // RustDoc/GoDoc/XML
  /"""/,                    // Python triple-quote
  /#'/,                     // R roxygen
  /--\s/,                   // Lua LDoc
];

export class BuiltInChecks {
  /**
   * Check docstring coverage across changed files.
   */
  async checkDocstringCoverage(files, config = {}) {
    const threshold = config.threshold || 80;
    const mode = config.mode || 'warning';

    if (!files || files.length === 0) {
      return { name: 'Docstring Coverage', status: 'pass', mode, message: 'No files to check' };
    }

    let totalFunctions = 0;
    let documentedFunctions = 0;

    for (const file of files) {
      const content = file.content || '';
      const lines = content.split('\n');

      // Count function definitions
      const funcPatterns = [
        /(?:export\s+)?(?:async\s+)?function\s+\w+/,
        /(?:export\s+)?class\s+\w+/,
        /(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/,
        /def\s+\w+/,
        /func\s+\w+/,
      ];

      for (let i = 0; i < lines.length; i++) {
        const isFunc = funcPatterns.some(p => p.test(lines[i]));
        if (!isFunc) continue;

        totalFunctions++;

        // Check if previous line has a doc comment
        const hasDoc = i > 0 && DOC_COMMENT_PATTERNS.some(p => {
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            if (p.test(lines[j])) return true;
          }
          return false;
        });

        if (hasDoc) documentedFunctions++;
      }
    }

    const coverage = totalFunctions > 0 ? (documentedFunctions / totalFunctions) * 100 : 100;
    const passed = coverage >= threshold;

    return {
      name: 'Docstring Coverage',
      status: passed ? 'pass' : 'fail',
      mode,
      message: `${coverage.toFixed(1)}% coverage (${documentedFunctions}/${totalFunctions} functions documented, threshold: ${threshold}%)`,
      details: { coverage, totalFunctions, documentedFunctions, threshold },
    };
  }

  /**
   * Validate PR title against a pattern.
   */
  async checkPRTitle(title, config = {}) {
    const pattern = config.pattern || '';
    const mode = config.mode || 'error';

    if (!title) {
      return { name: 'PR Title', status: 'fail', mode, message: 'PR title is empty' };
    }

    if (!pattern) {
      return { name: 'PR Title', status: 'pass', mode, message: 'No pattern configured' };
    }

    try {
      const regex = new RegExp(pattern);
      const passed = regex.test(title);

      return {
        name: 'PR Title',
        status: passed ? 'pass' : 'fail',
        mode,
        message: passed
          ? `Title matches pattern: ${pattern}`
          : `Title "${title}" does not match pattern: ${pattern}`,
      };
    } catch (error) {
      return { name: 'PR Title', status: 'fail', mode, message: `Invalid pattern: ${error.message}` };
    }
  }

  /**
   * Validate PR description.
   */
  async checkPRDescription(body, config = {}) {
    const minLength = config.min_length || 50;
    const template = config.template || '';
    const mode = config.mode || 'warning';

    if (!body || body.trim().length < minLength) {
      return {
        name: 'PR Description',
        status: 'fail',
        mode,
        message: `Description too short (minimum ${minLength} characters, got ${(body || '').trim().length})`,
      };
    }

    if (template) {
      const missingSections = [];
      const sections = template.split('\n').filter(l => l.startsWith('## ') || l.startsWith('### '));
      for (const section of sections) {
        if (!body.includes(section.replace(/^#+\s*/, ''))) {
          missingSections.push(section);
        }
      }
      if (missingSections.length > 0) {
        return {
          name: 'PR Description',
          status: 'fail',
          mode,
          message: `Missing template sections: ${missingSections.join(', ')}`,
        };
      }
    }

    return { name: 'PR Description', status: 'pass', mode, message: 'Description meets requirements' };
  }

  /**
   * Assess linked issues for PR readiness.
   */
  async checkIssueAssessment(prContext, config = {}) {
    const mode = config.mode || 'warning';

    // Check if PR has linked issues
    const body = prContext.body || '';
    const hasIssueRef = /#\d+|[A-Z]+-\d+/.test(body);

    if (!hasIssueRef) {
      return {
        name: 'Issue Assessment',
        status: 'fail',
        mode,
        message: 'No linked issues found in PR description',
      };
    }

    return {
      name: 'Issue Assessment',
      status: 'pass',
      mode,
      message: 'PR has linked issue references',
    };
  }
}

export default BuiltInChecks;
