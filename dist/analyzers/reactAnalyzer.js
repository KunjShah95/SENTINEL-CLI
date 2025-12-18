import BaseAnalyzer from './baseAnalyzer.js';

/**
 * ReactAnalyzer - React and JSX-specific code analysis
 * Detects common React anti-patterns, accessibility issues, and best practices
 */
export class ReactAnalyzer extends BaseAnalyzer {
    constructor(config) {
        super('ReactAnalyzer', config);
        this.patterns = this.initializePatterns();
    }

    initializePatterns() {
        return [
            // Hooks rules
            {
                pattern: /if\s*\([^)]+\)\s*{\s*(?:const|let)?\s*\[?\s*\w+\s*,?\s*\w*\s*\]?\s*=\s*use\w+/g,
                severity: 'high',
                type: 'bugs',
                title: 'Conditional hook call',
                message: 'Hooks must not be called conditionally. This breaks the Rules of Hooks.',
                suggestion: 'Move the hook call outside of the conditional block.',
            },
            {
                pattern: /for\s*\([^)]+\)\s*{\s*(?:const|let)?\s*\[?\s*\w+\s*,?\s*\w*\s*\]?\s*=\s*use\w+/g,
                severity: 'high',
                type: 'bugs',
                title: 'Hook inside loop',
                message: 'Hooks must not be called inside loops. This breaks the Rules of Hooks.',
                suggestion: 'Restructure to call hooks at the top level of your component.',
            },
            // Missing key prop
            {
                pattern: /\.map\s*\([^)]*\)\s*=>\s*(?:\(?\s*<\w+(?![^>]*\bkey\s*=))(?!.*\bkey\s*=)/g,
                severity: 'medium',
                type: 'bugs',
                title: 'Missing key prop in list',
                message: 'List items should have a unique "key" prop for React reconciliation.',
                suggestion: 'Add a unique key prop: <Component key={item.id} />',
            },
            // Index as key (anti-pattern)
            {
                pattern: /key\s*=\s*{?\s*(?:index|i|idx)\s*}?/g,
                severity: 'medium',
                type: 'quality',
                title: 'Array index used as key',
                message: 'Using array index as key can cause issues when list items are reordered.',
                suggestion: 'Use a unique identifier from your data instead of the array index.',
            },
            // Dangerous HTML
            {
                pattern: /dangerouslySetInnerHTML/g,
                severity: 'high',
                type: 'security',
                title: 'dangerouslySetInnerHTML usage',
                message: 'Using dangerouslySetInnerHTML can expose your app to XSS attacks.',
                suggestion: 'Sanitize HTML content before rendering or use a safe alternative.',
            },
            // Direct DOM manipulation
            {
                pattern: /document\.(getElementById|querySelector|getElementsBy)/g,
                severity: 'medium',
                type: 'quality',
                title: 'Direct DOM manipulation',
                message: 'Avoid direct DOM manipulation in React. Use refs or state instead.',
                suggestion: 'Use useRef hook or React state management.',
            },
            // Missing dependency array
            {
                pattern: /useEffect\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*{[^}]*}\s*\)/g,
                severity: 'medium',
                type: 'bugs',
                title: 'useEffect without dependency array',
                message: 'useEffect without a dependency array runs on every render.',
                suggestion: 'Add a dependency array: useEffect(() => {}, [dependencies])',
            },
            // Empty dependency array with state/props access
            {
                pattern: /useEffect\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*{[^}]*(?:props\.|state\.)[^}]*}\s*,\s*\[\s*\]\)/g,
                severity: 'high',
                type: 'bugs',
                title: 'Missing dependencies in useEffect',
                message: 'useEffect accesses props/state but has an empty dependency array.',
                suggestion: 'Add the accessed props/state to the dependency array.',
            },
            // Inline function in JSX (performance)
            {
                pattern: /on\w+\s*=\s*{\s*\([^)]*\)\s*=>/g,
                severity: 'info',
                type: 'performance',
                title: 'Inline arrow function in JSX',
                message: 'Inline arrow functions create new function instances on each render.',
                suggestion: 'Extract the handler to a useCallback hook for better performance.',
            },
            // State setter in render
            {
                pattern: /return\s*\([^)]*set\w+\s*\(/g,
                severity: 'high',
                type: 'bugs',
                title: 'State update during render',
                message: 'Calling setState during render can cause infinite loops.',
                suggestion: 'Move state updates to useEffect or event handlers.',
            },
            // Missing displayName
            {
                pattern: /(?:forwardRef|memo)\s*\(\s*(?:function\s*)?\([^)]*\)\s*=>/g,
                severity: 'info',
                type: 'quality',
                title: 'HOC without displayName',
                message: 'Components wrapped in forwardRef/memo should have a displayName for debugging.',
                suggestion: 'Add ComponentName.displayName = "ComponentName"',
            },
            // Accessibility issues
            {
                pattern: /<img(?![^>]*\balt\s*=)/g,
                severity: 'high',
                type: 'accessibility',
                title: 'Image without alt attribute',
                message: 'Images must have an alt attribute for screen readers.',
                suggestion: 'Add alt="description" or alt="" for decorative images.',
            },
            {
                pattern: /onClick\s*=\s*{[^}]+}\s*(?![^>]*(?:role|button|a\s|Link))/g,
                severity: 'medium',
                type: 'accessibility',
                title: 'Click handler on non-interactive element',
                message: 'Click handlers on divs/spans are not keyboard accessible.',
                suggestion: 'Use a button, link, or add role and keyboard handlers.',
            },
            {
                pattern: /<(?:button|input|select|textarea)(?![^>]*\btype\s*=)/g,
                severity: 'low',
                type: 'quality',
                title: 'Form element without type',
                message: 'Form elements should have explicit type attributes.',
                suggestion: 'Add type="button", type="submit", type="text", etc.',
            },
            // Deprecated lifecycle methods
            {
                pattern: /componentWillMount|componentWillReceiveProps|componentWillUpdate/g,
                severity: 'medium',
                type: 'quality',
                title: 'Deprecated lifecycle method',
                message: 'This lifecycle method is deprecated and will be removed in React 18.',
                suggestion: 'Use componentDidMount, getDerivedStateFromProps, or getSnapshotBeforeUpdate.',
            },
            // setState in constructor
            {
                pattern: /constructor\s*\([^)]*\)\s*{[^}]*this\.setState/g,
                severity: 'high',
                type: 'bugs',
                title: 'setState in constructor',
                message: 'Calling setState in constructor is invalid. Initialize state directly.',
                suggestion: 'Use this.state = { ... } instead of this.setState().',
            },
        ];
    }

    shouldAnalyzeFile(filePath) {
        // Only analyze JSX/TSX files
        return /\.(jsx|tsx)$/.test(filePath) && super.shouldAnalyzeFile(filePath);
    }

    async analyze(files, context) {
        this.reset();
        const startTime = Date.now();

        for (const file of files) {
            if (!this.shouldAnalyzeFile(file.path)) continue;

            this.stats.filesAnalyzed++;
            this.stats.linesAnalyzed += file.content.split('\n').length;

            await this.analyzeFile(file.path, file.content, context);
        }

        this.stats.executionTime = Date.now() - startTime;
        return this.getIssues();
    }

    async analyzeFile(filePath, content, _context) {
        const lines = content.split('\n');

        for (const pattern of this.patterns) {
            // Check file pattern if specified
            if (pattern.filePattern && !pattern.filePattern.test(filePath)) {
                continue;
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const matches = line.match(pattern.pattern);

                if (matches) {
                    // Skip if in a comment
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('{/*')) {
                        continue;
                    }

                    this.addIssue({
                        severity: pattern.severity,
                        type: pattern.type,
                        title: pattern.title,
                        message: pattern.message,
                        file: filePath,
                        line: i + 1,
                        column: line.indexOf(matches[0]) + 1,
                        snippet: line.trim(),
                        suggestion: pattern.suggestion,
                        tags: ['react', pattern.type],
                        analyzer: this.name,
                    });
                }
            }
        }
    }
}

export default ReactAnalyzer;
