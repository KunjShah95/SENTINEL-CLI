import { BaseAnalyzer } from './baseAnalyzer.js';

/**
 * Vue.js Analyzer
 * Detects security issues and best practice violations in Vue.js code
 */
export class VueAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this.name = 'vue';
    this.initializePatterns();
  }

  initializePatterns() {
    this.securityPatterns = [
      {
        id: 'vue/v-html-xss',
        pattern: /v-html\s*=\s*["'][^"']+["']/,
        severity: 'high',
        title: 'Potential XSS via v-html',
        message: 'v-html can render raw HTML, leading to XSS if content is not sanitized.',
        suggestion: 'Sanitize content with DOMPurify or use v-text for plain text.',
      },
      {
        id: 'vue/dynamic-component-xss',
        pattern: /:is\s*=\s*["'][^"']*\+|:is\s*=\s*[^"'\s]+(?!["'])/,
        severity: 'medium',
        title: 'Dynamic component with user input',
        message: 'Dynamic components (:is) with user-controlled values can be exploited.',
        suggestion: 'Whitelist allowed component names.',
      },
      {
        id: 'vue/href-javascript',
        pattern: /:href\s*=\s*["']javascript:/i,
        severity: 'critical',
        title: 'JavaScript URL in href',
        message: 'javascript: URLs can execute arbitrary code.',
        suggestion: 'Validate and sanitize URLs. Use router-link for navigation.',
      },
      {
        id: 'vue/v-bind-style-injection',
        pattern: /:style\s*=\s*[^"'\s]+(?!["'])/,
        severity: 'medium',
        title: 'Potential style injection',
        message: 'Dynamic styles with user input can lead to CSS injection attacks.',
        suggestion: 'Validate style values or use CSS classes instead.',
      },
      {
        id: 'vue/template-expression-eval',
        pattern: /\{\{\s*.*(?:eval|Function|setTimeout|setInterval)\s*\(/,
        severity: 'critical',
        title: 'Dangerous function in template',
        message: 'eval and similar functions in templates can execute arbitrary code.',
        suggestion: 'Never use eval or Function constructor in templates.',
      },
    ];

    this.performancePatterns = [
      {
        id: 'vue/v-if-v-for',
        pattern: /v-if\s*=.*v-for|v-for.*v-if\s*=/,
        severity: 'medium',
        title: 'v-if and v-for on same element',
        message: 'v-for has higher priority than v-if, causing unnecessary iterations.',
        suggestion: 'Move v-if to a wrapper element or use computed property to filter.',
      },
      {
        id: 'vue/missing-key',
        pattern: /v-for\s*=\s*["'][^"']+["'](?![^>]*:key)/,
        severity: 'medium',
        title: 'Missing :key in v-for',
        message: 'v-for without :key can cause rendering issues and poor performance.',
        suggestion: 'Add unique :key attribute to v-for elements.',
      },
      {
        id: 'vue/index-as-key',
        pattern: /v-for\s*=\s*["']\s*\([^)]*,\s*(\w+)\s*\)[^"']*["'][^>]*:key\s*=\s*["']\s*\1\s*["']/,
        severity: 'low',
        title: 'Using index as :key',
        message: 'Using index as key can cause issues when list order changes.',
        suggestion: 'Use a unique identifier from the item instead of index.',
      },
      {
        id: 'vue/large-inline-handler',
        pattern: /@(?:click|input|change|submit)\s*=\s*["'][^"']{50,}["']/,
        severity: 'low',
        title: 'Large inline event handler',
        message: 'Complex logic in templates reduces readability and maintainability.',
        suggestion: 'Move logic to a method in the methods section.',
      },
    ];

    this.compositionApiPatterns = [
      {
        id: 'vue/reactive-destructure',
        pattern: /const\s*\{\s*[^}]+\}\s*=\s*(?:reactive|toRefs)\s*\(/,
        severity: 'medium',
        title: 'Destructuring reactive object',
        message: 'Destructuring reactive() loses reactivity. Use toRefs() first.',
        suggestion: 'Use const { prop } = toRefs(state) or access via state.prop.',
      },
      {
        id: 'vue/ref-no-value',
        pattern: /ref\s*\([^)]+\)(?!\s*\.value)/,
        severity: 'info',
        title: 'Remember to use .value with ref',
        message: 'ref() returns an object, access the value with .value in script.',
        suggestion: 'Use myRef.value in script, but myRef directly in template.',
      },
      {
        id: 'vue/watch-no-cleanup',
        pattern: /watch\s*\([^)]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]*(?:fetch|axios|setTimeout)[^}]*\}\s*\)/s,
        severity: 'medium',
        title: 'Watch effect without cleanup',
        message: 'Async operations in watch should be cleaned up to prevent memory leaks.',
        suggestion: 'Use onCleanup callback or watchEffect with cleanup function.',
      },
    ];

    this.bestPractices = [
      {
        id: 'vue/no-arrow-methods',
        pattern: /methods\s*:\s*\{[^}]*\w+\s*:\s*\([^)]*\)\s*=>/s,
        severity: 'medium',
        title: 'Arrow function in methods',
        message: 'Arrow functions in methods lose `this` context.',
        suggestion: 'Use regular function syntax in methods.',
      },
      {
        id: 'vue/no-mutate-props',
        pattern: /this\.\$props\.\w+\s*=|props\.\w+\s*=/,
        severity: 'high',
        title: 'Mutating props',
        message: 'Props should not be mutated directly. Use events to notify parent.',
        suggestion: 'Emit an event with $emit() and let parent update the prop.',
      },
      {
        id: 'vue/no-deprecated-events-api',
        pattern: /\$on\s*\(|\$off\s*\(|\$once\s*\(/,
        severity: 'medium',
        title: 'Deprecated events API',
        message: '$on, $off, and $once are removed in Vue 3.',
        suggestion: 'Use external event bus (mitt) or provide/inject pattern.',
      },
      {
        id: 'vue/no-deprecated-filter',
        pattern: /\{\{\s*[^}]+\|[^}]+\}\}/,
        severity: 'medium',
        title: 'Deprecated filter syntax',
        message: 'Filters ({{ value | filter }}) are removed in Vue 3.',
        suggestion: 'Use computed properties or methods instead.',
      },
      {
        id: 'vue/setup-no-return',
        pattern: /setup\s*\([^)]*\)\s*\{[^}]*(?!return)[^}]*\}/s,
        severity: 'medium',
        title: 'setup() without return',
        message: 'setup() should return reactive values for template access.',
        suggestion: 'Return an object with reactive values or use <script setup>.',
      },
      {
        id: 'vue/no-v-model-argument-vue2',
        pattern: /v-model:\w+\s*=/,
        severity: 'info',
        title: 'v-model with argument (Vue 3 only)',
        message: 'v-model:propName syntax is Vue 3 only.',
        suggestion: 'In Vue 2, use :propName.sync instead.',
      },
    ];

    this.a11yPatterns = [
      {
        id: 'vue/click-no-keyboard',
        pattern: /@click\s*=(?![^>]*@keydown|[^>]*@keyup|[^>]*@keypress)/,
        severity: 'medium',
        title: 'Click handler without keyboard support',
        message: 'Interactive elements should support keyboard navigation.',
        suggestion: 'Add @keydown.enter or use a button element.',
      },
      {
        id: 'vue/img-no-alt',
        pattern: /<img[^>]+(?!alt=)[^>]*>/,
        severity: 'medium',
        title: 'Image without alt attribute',
        message: 'Images should have alt text for accessibility.',
        suggestion: 'Add alt="description" or alt="" for decorative images.',
      },
      {
        id: 'vue/form-no-label',
        pattern: /<input[^>]+(?!aria-label|aria-labelledby)[^>]*>(?![^<]*<label)/,
        severity: 'medium',
        title: 'Form input without label',
        message: 'Form inputs should have associated labels.',
        suggestion: 'Add <label for="id"> or aria-label attribute.',
      },
    ];
  }

  shouldAnalyzeFile(filePath) {
    return filePath.endsWith('.vue') || 
           (filePath.endsWith('.js') && filePath.includes('vue'));
  }

  async analyze(files, context) {
    this.issues = [];
    const vueFiles = files.filter(f => this.shouldAnalyzeFile(f));

    for (const file of vueFiles) {
      try {
        const content = await this.readFile(file);
        await this.analyzeFile(file, content, context);
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      analyzer: this.name,
      issues: this.issues,
      stats: this.getStats(),
    };
  }

  async readFile(filePath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Validate and sanitize file path
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new Error('Path traversal detected');
    }
    
    return fs.readFile(normalizedPath, 'utf8');
  }

  async analyzeFile(filePath, content, _context) {
    const lines = content.split('\n');
    const allPatterns = [
      ...this.securityPatterns,
      ...this.performancePatterns,
      ...this.compositionApiPatterns,
      ...this.bestPractices,
      ...this.a11yPatterns,
    ];

    for (const rule of allPatterns) {
      if (rule.pattern) {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
          const lineNum = this.getLineNumber(content, match.index);
          this.addIssue({
            id: rule.id,
            file: filePath,
            line: lineNum,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            suggestion: rule.suggestion,
            code: lines[lineNum - 1]?.trim(),
            analyzer: this.name,
          });
        }
      }
    }
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }
}
