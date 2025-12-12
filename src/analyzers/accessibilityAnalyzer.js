import BaseAnalyzer from './baseAnalyzer.js';

/**
 * AccessibilityAnalyzer - Analyzes code for accessibility (a11y) issues
 * Supports HTML, JSX, React, Vue, and Angular templates
 */
export class AccessibilityAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('AccessibilityAnalyzer', config);
    this.rules = this.initializeAccessibilityRules();
  }

  async analyze(files, context) {
    this.reset();
    const startTime = Date.now();

    for (const file of files) {
      if (!this.shouldAnalyzeFile(file.path)) continue;
      if (!this.isWebFile(file.path)) continue;

      this.stats.filesAnalyzed++;
      this.stats.linesAnalyzed += file.content.split('\n').length;

      await this.analyzeFile(file.path, file.content, context);
    }

    this.stats.executionTime = Date.now() - startTime;
    return this.getIssues();
  }

  isWebFile(filePath) {
    const webExtensions = ['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte'];
    return webExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  async analyzeFile(filePath, content, _context) {
    const issues = [];

    // Run all accessibility checks
    issues.push(...this.checkImageAccessibility(content, filePath));
    issues.push(...this.checkFormAccessibility(content, filePath));
    issues.push(...this.checkInteractiveElements(content, filePath));
    issues.push(...this.checkSemanticHTML(content, filePath));
    issues.push(...this.checkARIAUsage(content, filePath));
    issues.push(...this.checkColorContrast(content, filePath));
    issues.push(...this.checkKeyboardAccessibility(content, filePath));

    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializeAccessibilityRules() {
    return {
      images: [
        {
          pattern: /<img(?![^>]*\balt\s*=)[^>]*>/gi,
          severity: 'high',
          title: 'Image missing alt attribute',
          message: 'Images must have alt text for screen readers',
          suggestion: 'Add descriptive alt text or alt="" for decorative images',
        },
        {
          pattern: /<img[^>]*alt\s*=\s*['"]['"][^>]*>/gi,
          severity: 'medium',
          title: 'Empty alt attribute',
          message: 'Empty alt is only appropriate for decorative images',
          suggestion: 'Add descriptive alt text or use role="presentation"',
        },
      ],
      forms: [
        {
          pattern:
            /<input(?![^>]*(?:aria-label|aria-labelledby|id\s*=\s*['"][^'"]+['"])[^>]*<label)[^>]*>/gi,
          severity: 'high',
          title: 'Form input missing label',
          message: 'Form inputs must have associated labels',
          suggestion: 'Add a <label> element or aria-label attribute',
        },
        {
          pattern: /<select(?![^>]*(?:aria-label|aria-labelledby))[^>]*>/gi,
          severity: 'medium',
          title: 'Select missing accessible label',
          message: 'Select elements should have accessible names',
          suggestion: 'Add aria-label or associate with a label element',
        },
      ],
    };
  }

  checkImageAccessibility(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for images without alt
      if (/<img[^>]*>/i.test(line) && !/alt\s*=/i.test(line)) {
        issues.push({
          severity: 'high',
          type: 'accessibility',
          title: 'Image missing alt attribute',
          message: 'Images must have alt text for screen reader users',
          file: filePath,
          line: i + 1,
          snippet: this.getCodeSnippet(content, i + 1).snippet,
          suggestion: 'Add alt="description" or alt="" for decorative images',
          tags: ['a11y', 'wcag', 'images'],
          analyzer: this.name,
        });
      }

      // Check for background images without alternatives
      if (/background-image\s*:\s*url/i.test(line) && !/role\s*=\s*['"]img['"]/i.test(line)) {
        issues.push({
          severity: 'info',
          type: 'accessibility',
          title: 'Background image may need alternative',
          message: 'Meaningful background images should have text alternatives',
          file: filePath,
          line: i + 1,
          snippet: this.getCodeSnippet(content, i + 1).snippet,
          suggestion: 'If image conveys meaning, add role="img" and aria-label',
          tags: ['a11y', 'wcag', 'images'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }

  checkFormAccessibility(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Input without label (simple check)
      if (/<input/i.test(line) && !/type\s*=\s*['"](hidden|submit|button)['"]/i.test(line)) {
        if (!/aria-label|aria-labelledby/i.test(line)) {
          // Check if there's a nearby label (simplified)
          const context = lines.slice(Math.max(0, i - 3), i + 3).join(' ');
          if (!/for\s*=|<label/i.test(context)) {
            issues.push({
              severity: 'high',
              type: 'accessibility',
              title: 'Form input potentially missing label',
              message: 'Form controls must have accessible names',
              file: filePath,
              line: i + 1,
              snippet: this.getCodeSnippet(content, i + 1).snippet,
              suggestion: 'Add <label for="id"> or aria-label attribute',
              tags: ['a11y', 'wcag', 'forms'],
              analyzer: this.name,
            });
          }
        }
      }

      // Required fields without aria-required
      if (/required/i.test(line) && !/aria-required/i.test(line)) {
        issues.push({
          severity: 'low',
          type: 'accessibility',
          title: 'Required field without ARIA indicator',
          message: 'Consider adding aria-required for better screen reader support',
          file: filePath,
          line: i + 1,
          suggestion: 'Add aria-required="true" alongside required attribute',
          tags: ['a11y', 'wcag', 'forms'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }

  checkInteractiveElements(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Clickable div/span without proper role
      if (/onClick|@click|v-on:click|\(click\)/i.test(line)) {
        if (/<(div|span)/i.test(line) && !/role\s*=\s*['"](button|link)/i.test(line)) {
          issues.push({
            severity: 'high',
            type: 'accessibility',
            title: 'Clickable element missing role',
            message: 'Non-semantic clickable elements need proper ARIA roles',
            file: filePath,
            line: i + 1,
            snippet: this.getCodeSnippet(content, i + 1).snippet,
            suggestion: 'Use <button> or add role="button" with tabindex="0"',
            tags: ['a11y', 'wcag', 'interactive'],
            analyzer: this.name,
          });
        }
      }

      // Links without href
      if (/<a(?![^>]*href)[^>]*>/i.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'accessibility',
          title: 'Anchor tag missing href',
          message: 'Links without href are not keyboard accessible',
          file: filePath,
          line: i + 1,
          suggestion: 'Add href or use <button> for interactive elements',
          tags: ['a11y', 'wcag', 'links'],
          analyzer: this.name,
        });
      }

      // Target blank without rel
      if (/target\s*=\s*['"]_blank['"]/i.test(line) && !/rel\s*=/i.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'accessibility',
          title: 'External link missing rel attribute',
          message: 'Links opening new tabs should have rel="noopener noreferrer"',
          file: filePath,
          line: i + 1,
          suggestion: 'Add rel="noopener noreferrer" for security and accessibility',
          tags: ['a11y', 'security', 'links'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }

  checkSemanticHTML(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    // Check for semantic structure
    const hasMain = /<main/i.test(content);
    const _hasNav = /<nav/i.test(content); // eslint-disable-line no-unused-vars
    const _hasHeader = /<header/i.test(content); // eslint-disable-line no-unused-vars
    const _hasFooter = /<footer/i.test(content); // eslint-disable-line no-unused-vars
    const hasH1 = /<h1/i.test(content);

    // Only check in HTML files that appear to be full pages
    if (/<html|<!DOCTYPE/i.test(content)) {
      if (!hasMain) {
        issues.push({
          severity: 'medium',
          type: 'accessibility',
          title: 'Missing <main> landmark',
          message: 'Pages should have a <main> landmark for main content',
          file: filePath,
          line: 1,
          suggestion: 'Wrap primary content in <main> element',
          tags: ['a11y', 'wcag', 'landmarks'],
          analyzer: this.name,
        });
      }

      if (!hasH1) {
        issues.push({
          severity: 'medium',
          type: 'accessibility',
          title: 'Missing <h1> heading',
          message: 'Pages should have exactly one <h1> for the main heading',
          file: filePath,
          line: 1,
          suggestion: 'Add an <h1> element for the page title',
          tags: ['a11y', 'wcag', 'headings'],
          analyzer: this.name,
        });
      }
    }

    // Check heading hierarchy
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Simple heading skip check
      const h2Match = /<h([2-6])/i.exec(line);
      if (h2Match) {
        const level = parseInt(h2Match[1], 10);
        // Check if any heading of level-1 exists before this
        const prevContent = lines.slice(0, i).join('\n');
        const prevLevel = level - 1;
        const prevPattern = new RegExp(`<h${prevLevel}`, 'i');

        if (level > 2 && !prevPattern.test(prevContent) && prevLevel > 1) {
          issues.push({
            severity: 'medium',
            type: 'accessibility',
            title: 'Potentially skipped heading level',
            message: `<h${level}> found without preceding <h${prevLevel}>`,
            file: filePath,
            line: i + 1,
            suggestion: 'Maintain proper heading hierarchy (h1 → h2 → h3)',
            tags: ['a11y', 'wcag', 'headings'],
            analyzer: this.name,
          });
        }
      }
    }

    return issues;
  }

  checkARIAUsage(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for redundant ARIA
      if (/<button[^>]*role\s*=\s*['"]button['"]/i.test(line)) {
        issues.push({
          severity: 'info',
          type: 'accessibility',
          title: 'Redundant ARIA role',
          message: 'role="button" is redundant on <button> elements',
          file: filePath,
          line: i + 1,
          suggestion: 'Remove redundant role attribute',
          tags: ['a11y', 'aria', 'redundant'],
          analyzer: this.name,
        });
      }

      // Check for invalid ARIA
      if (/aria-[a-z]+\s*=\s*['"]/i.test(line)) {
        const ariaMatch = line.match(/aria-([a-z]+)/gi);
        if (ariaMatch) {
          const validAria = [
            'aria-label',
            'aria-labelledby',
            'aria-describedby',
            'aria-hidden',
            'aria-expanded',
            'aria-selected',
            'aria-checked',
            'aria-disabled',
            'aria-pressed',
            'aria-live',
            'aria-atomic',
            'aria-busy',
            'aria-controls',
            'aria-current',
            'aria-haspopup',
            'aria-invalid',
            'aria-modal',
            'aria-owns',
            'aria-placeholder',
            'aria-required',
            'aria-valuemax',
            'aria-valuemin',
            'aria-valuenow',
            'aria-valuetext',
            'aria-level',
            'aria-multiline',
            'aria-multiselectable',
            'aria-orientation',
            'aria-readonly',
            'aria-relevant',
            'aria-roledescription',
            'aria-rowcount',
            'aria-rowindex',
            'aria-rowspan',
            'aria-setsize',
            'aria-sort',
            'aria-colcount',
            'aria-colindex',
            'aria-colspan',
          ];

          for (const aria of ariaMatch) {
            if (!validAria.includes(aria.toLowerCase())) {
              issues.push({
                severity: 'medium',
                type: 'accessibility',
                title: 'Potentially invalid ARIA attribute',
                message: `${aria} may not be a valid ARIA attribute`,
                file: filePath,
                line: i + 1,
                suggestion: 'Verify the ARIA attribute name is correct',
                tags: ['a11y', 'aria', 'validation'],
                analyzer: this.name,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  checkColorContrast(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for very light colors on white (simplified)
      if (/color\s*:\s*#[fF]{3,6}/i.test(line) || /color\s*:\s*white/i.test(line)) {
        issues.push({
          severity: 'info',
          type: 'accessibility',
          title: 'Potential contrast issue',
          message: 'Very light text colors may have insufficient contrast',
          file: filePath,
          line: i + 1,
          suggestion: 'Verify color contrast meets WCAG AA (4.5:1 for text)',
          tags: ['a11y', 'wcag', 'color'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }

  checkKeyboardAccessibility(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for tabindex > 0
      if (/tabindex\s*=\s*['"]([1-9]|[1-9][0-9]+)['"]/i.test(line)) {
        issues.push({
          severity: 'high',
          type: 'accessibility',
          title: 'Positive tabindex value',
          message: 'Positive tabindex values disrupt natural tab order',
          file: filePath,
          line: i + 1,
          snippet: this.getCodeSnippet(content, i + 1).snippet,
          suggestion: 'Use tabindex="0" or restructure DOM for correct order',
          tags: ['a11y', 'wcag', 'keyboard'],
          analyzer: this.name,
        });
      }

      // Check for outline removal
      if (/outline\s*:\s*(none|0)/i.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'accessibility',
          title: 'Focus outline removed',
          message: 'Removing focus outlines harms keyboard navigation',
          file: filePath,
          line: i + 1,
          suggestion: 'Provide custom focus styles instead of removing outlines',
          tags: ['a11y', 'wcag', 'keyboard'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }
}

export default AccessibilityAnalyzer;
