import BaseAnalyzer from './baseAnalyzer.js';

/**
 * TypeScriptAnalyzer - TypeScript-specific code analysis
 * Detects common TypeScript anti-patterns and issues
 */
export class TypeScriptAnalyzer extends BaseAnalyzer {
    constructor(config) {
        super('TypeScriptAnalyzer', config);
        this.patterns = this.initializePatterns();
    }

    initializePatterns() {
        return [
            // Type safety issues
            {
                pattern: /:\s*any\b/g,
                severity: 'medium',
                type: 'quality',
                title: 'Explicit any type',
                message: 'Using "any" defeats TypeScript\'s type checking. Consider using a more specific type or "unknown".',
                suggestion: 'Replace "any" with a specific type, generic, or "unknown" for better type safety.',
            },
            {
                pattern: /as\s+any\b/g,
                severity: 'high',
                type: 'quality',
                title: 'Type assertion to any',
                message: 'Casting to "any" bypasses type checking and can hide bugs.',
                suggestion: 'Use proper type guards or more specific type assertions.',
            },
            {
                pattern: /@ts-ignore/g,
                severity: 'medium',
                type: 'quality',
                title: '@ts-ignore comment',
                message: 'Using @ts-ignore suppresses all TypeScript errors on the next line.',
                suggestion: 'Fix the underlying type issue or use @ts-expect-error with a reason.',
            },
            {
                pattern: /@ts-nocheck/g,
                severity: 'high',
                type: 'quality',
                title: '@ts-nocheck directive',
                message: 'This file has TypeScript checking disabled entirely.',
                suggestion: 'Remove @ts-nocheck and fix the type errors.',
            },
            // Non-null assertions
            {
                pattern: /\w+!/g,
                severity: 'low',
                type: 'quality',
                title: 'Non-null assertion operator',
                message: 'The ! operator asserts a value is not null/undefined without checking.',
                suggestion: 'Use optional chaining (?.) or proper null checks instead.',
                filePattern: /\.tsx?$/,
            },
            // Empty interface
            {
                pattern: /interface\s+\w+\s*{\s*}/g,
                severity: 'info',
                type: 'quality',
                title: 'Empty interface',
                message: 'Empty interfaces may indicate incomplete types.',
                suggestion: 'Add properties or use type alias if extending.',
            },
            // Namespace usage (discouraged in modern TS)
            {
                pattern: /\bnamespace\s+\w+/g,
                severity: 'info',
                type: 'quality',
                title: 'Namespace usage',
                message: 'Namespaces are discouraged in modern TypeScript.',
                suggestion: 'Use ES modules (import/export) instead of namespaces.',
            },
            // Enum issues
            {
                pattern: /const\s+enum\s+/g,
                severity: 'info',
                type: 'quality',
                title: 'Const enum',
                message: 'Const enums can cause issues with transpilation and isolatedModules.',
                suggestion: 'Consider using regular enums or string literal unions.',
            },
            // Object type
            {
                pattern: /:\s*Object\b/g,
                severity: 'medium',
                type: 'quality',
                title: 'Object type usage',
                message: 'The Object type is too broad. It matches any non-primitive.',
                suggestion: 'Use "object" (lowercase), Record<string, unknown>, or a specific interface.',
            },
            // Function type
            {
                pattern: /:\s*Function\b/g,
                severity: 'medium',
                type: 'quality',
                title: 'Function type usage',
                message: 'The Function type is too broad and loses parameter/return type info.',
                suggestion: 'Use a specific function signature like (arg: Type) => ReturnType.',
            },
            // Potential runtime errors
            {
                pattern: /JSON\.parse\s*\([^)]+\)\s*(?!as\s)/g,
                severity: 'medium',
                type: 'bugs',
                title: 'Untyped JSON.parse',
                message: 'JSON.parse returns "any". The result should be validated or typed.',
                suggestion: 'Add type assertion with validation or use a schema validation library.',
            },
            // Async without await
            {
                pattern: /async\s+(?:function\s+\w+|\w+\s*=\s*async)\s*\([^)]*\)\s*(?::\s*\w+\s*)?{\s*(?:(?!await)[^}])*}/g,
                severity: 'info',
                type: 'bugs',
                title: 'Async function without await',
                message: 'This async function does not contain any await expressions.',
                suggestion: 'Either add await or remove the async keyword.',
            },
        ];
    }

    shouldAnalyzeFile(filePath) {
        // Only analyze TypeScript files
        return /\.(ts|tsx)$/.test(filePath) && super.shouldAnalyzeFile(filePath);
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
                    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
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
                        tags: ['typescript', pattern.type],
                        analyzer: this.name,
                    });
                }
            }
        }
    }
}

export default TypeScriptAnalyzer;
