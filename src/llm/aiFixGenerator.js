import { EventEmitter } from 'events';
import path from 'path';

/**
 * AI-powered fix generation for Sentinel issues
 * Generates intelligent code fixes beyond just suggestions
 */
export class AIFixGenerator extends EventEmitter {
    constructor(llmOrchestrator, config) {
        super();
        this.llm = llmOrchestrator;
        this.config = config || {};
        this.fixHistory = new Map();
        this.maxHistorySize = 100;
        this.validationThreshold = this.config.validationThreshold || 0.7;
    }

    /**
     * Generate fix for a specific issue
     */
    async generateFix(issue, context = {}) {
        // Validate input parameters
        if (!issue || typeof issue !== 'object' || !issue.type || !issue.file) {
            throw new Error('Invalid issue object: must have type and file properties');
        }

        const startTime = Date.now();

        try {
            this.emit('fix-generation-start', { issue, startTime });

            // Get context around the issue
            const enrichedContext = await this.enrichContext(issue, context);

            // Generate fix using AI
            const fix = await this.generateAIFix(issue, enrichedContext);

            // Validate the fix
            const validatedFix = await this.validateFix(issue, fix, enrichedContext);

            // Cache the result
            this.cacheFix(issue, validatedFix);

            const duration = Date.now() - startTime;

            this.emit('fix-generation-complete', {
                issue,
                fix: validatedFix,
                duration
            });

            return validatedFix;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.emit('fix-generation-error-details', {
                issueType: issue?.type || 'unknown',
                duration
            });
            // Sanitize error information before emitting
            this.emit('fix-generation-error', { 
                issue, 
                error: { message: error.message, type: error.constructor.name }, 
                duration 
            });
            throw error;
        }
    }

    /**
     * Generate fixes for multiple issues
     */
    async generateBatchFixes(issues, context = {}) {
        const fixes = [];
        const batchSize = 5; // Process in batches to avoid overwhelming AI

        for (let i = 0; i < issues.length; i += batchSize) {
            const batch = issues.slice(i, i + batchSize);

            const batchPromises = batch.map(issue =>
                this.generateFix(issue, context).catch(error => ({
                    issue,
                    error: error.message || 'Unknown error',
                    success: false,
                    fix: null,
                    validation: { overallScore: 0 }
                }))
            );

            const batchResults = await Promise.all(batchPromises);
            fixes.push(...batchResults);

            // Emit progress
            this.emit('batch-progress', {
                completed: Math.min(i + batchSize, issues.length),
                total: issues.length,
                percentage: Math.round((Math.min(i + batchSize, issues.length) / issues.length) * 100),
            });
        }

        return fixes;
    }

    /**
     * Enrich context with additional information
     */
    async enrichContext(issue, context) {
        return {
            ...context,
            fileContent: context.fileContent || '',
            surroundingLines: context.surroundingLines || this.getSurroundingLines(issue, 10),
            language: this.detectLanguage(issue.file),
            framework: this.detectFramework(issue.file, context.fileContent),
            dependencies: context.dependencies || [],
            similarIssues: context.similarIssues || [],
            fixHistory: this.getFixHistory(issue.type, issue.analyzer),
        };
    }

    /**
     * Get surrounding lines for context
     */
    getSurroundingLines(issue, contextSize = 10) {
        try {
            // Validate input
            if (!issue || typeof issue !== 'object') return [];
            if (!issue.snippet || typeof issue.snippet !== 'string') return [];

            const lines = issue.snippet.split('\n');
            if (!Array.isArray(lines) || lines.length === 0) return [];

            const targetLineIndex = lines.findIndex(line =>
                (typeof line === 'string') && (line.includes('>>>') || (issue.line && line.trim().startsWith(`${issue.line}:`)))
            );

            if (targetLineIndex === -1) return lines;

            const parsedContextSize = Math.max(0, parseInt(contextSize, 10) || 0);
            const start = Math.max(0, targetLineIndex - parsedContextSize);
            const end = Math.min(lines.length, targetLineIndex + parsedContextSize + 1);

            return lines.slice(start, end);
        } catch (error) {
            // Log and fail gracefully
            try {
                this.emit('surrounding-lines-error', { file: (issue && issue.file) || 'unknown' });
            } catch (e) {
                // ignore logging failures
            }
            return [];
        }
    }

    /**
     * Detect programming language from file
     */
    detectLanguage(filePath) {
        if (!filePath || typeof filePath !== 'string') return 'unknown';
        const ext = path.extname(filePath).slice(1).toLowerCase();

        const languageMap = {
            'js': 'javascript',
            'jsx': 'react',
            'ts': 'typescript',
            'tsx': 'react-typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'swift': 'swift',
            'kt': 'kotlin',
            'vue': 'vue',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            'xml': 'xml',
            'sql': 'sql',
        };

        return languageMap[ext] || 'unknown';
    }

    /**
     * Detect framework from file and content
     */
    detectFramework(filePath, content = '') {
        if (!filePath || !content) return 'none';
        
        const detections = {
            react: /import.*from ['"]react['"]|React\.|jsx|tsx/i.test(content) || /\.jsx?$|\.tsx?$/i.test(filePath),
            vue: /import.*from ['"]vue['"]|Vue\.|\.vue/i.test(content) || /\.vue$/i.test(filePath),
            angular: /import.*from ['"]@angular/i.test(content),
            express: /require\(['"]express['"]|import.*from ['"]express['"]/i.test(content),
            next: /import.*from ['"]next['"]|getServerSideProps|getStaticProps/i.test(content),
            django: /(^|\s)from\s+django|(^|\s)import\s+django/i.test(content),
            flask: /(^|\s)from\s+flask|(^|\s)import\s+flask/i.test(content),
            spring: /@SpringBootApplication|org\.springframework/i.test(content),
        };

        for (const [framework, detected] of Object.entries(detections)) {
            if (detected) return framework;
        }

        return 'none';
    }

    /**
     * Get fix history for similar issues
     */
    getFixHistory(issueType, analyzer) {
        const key = `${analyzer}-${issueType}`;
        return this.fixHistory.get(key) || [];
    }

    /**
     * Cache successful fixes
     */
    cacheFix(issue, fix) {
        const key = `${issue.analyzer}-${issue.type}`;
        const history = this.fixHistory.get(key) || [];

        history.push({
            issue,
            fix,
            timestamp: new Date().toISOString(),
            success: fix.success || false,
        });

        // Keep only recent history - more efficient approach
        if (history.length > this.maxHistorySize) {
            const newHistory = history.slice(-this.maxHistorySize);
            this.fixHistory.set(key, newHistory);
            return;
        }

        this.fixHistory.set(key, history);
    }

    /**
     * Generate AI fix using LLM
     */
    async generateAIFix(issue, context) {
        try {
            const prompt = this.buildFixPrompt(issue, context);

            const response = await this.llm.generateResponse({
                prompt,
                maxTokens: 1000,
                temperature: 0.3,
                systemPrompt: this.getSystemPrompt(),
            });

            return this.parseFixResponse(response, issue, context);
        } catch (error) {
            this.emit('llm-api-error', { timestamp: Date.now() });
            throw new Error(`Failed to generate AI fix: ${error.message}`);
        }
    }

    /**
     * Build comprehensive fix prompt
     */
    buildFixPrompt(issue, context) {
        // Validate inputs
        if (!issue || !context) {
            throw new Error('Invalid issue or context for prompt building');
        }

        return `
You are an expert software engineer helping to fix code issues. Please analyze the following issue and provide a complete fix.

ISSUE DETAILS:
- Type: ${issue?.type || 'unknown'}
- Severity: ${issue?.severity || 'unknown'}
- Analyzer: ${issue?.analyzer || 'unknown'}
- Message: ${issue?.message || 'No message'}
- File: ${issue?.file || 'unknown'}
- Line: ${issue?.line || 'unknown'}
- Column: ${issue?.column || 'N/A'}

CONTEXT:
${context?.fileContent ? `
CURRENT CODE:
\`\`\`${context.language || 'text'}
${context.fileContent}
\`\`\`
` : ''}

${context?.surroundingLines?.length > 0 ? `
SURROUNDING CODE:
\`\`\`${context.language || 'text'}
${context.surroundingLines.join('\n')}
\`\`\`
` : ''}

${context?.framework !== 'none' ? `
FRAMEWORK: ${context.framework}
` : ''}

${Array.isArray(context?.dependencies) && context.dependencies.length > 0 ? `
DEPENDENCIES:
${context.dependencies.map(dep => `- ${dep?.name || 'unknown'}@${dep?.version || 'unknown'}`).join('\n')}
` : ''}

${Array.isArray(context?.fixHistory) && context.fixHistory.length > 0 ? `
SIMILAR FIXES HISTORY:
${context.fixHistory.slice(0, 3).map(fix => `- ${fix?.fix?.summary || 'No summary'}`).join('\n')}
` : ''}

TASK:
1. Analyze the issue and understand the root cause
2. Provide a complete, working fix
3. Explain why this fix works
4. Consider edge cases and potential side effects
5. Follow best practices for ${context?.language || 'the language'}

RESPONSE FORMAT:
{
  "fix": {
    "summary": "Brief summary of fix",
    "description": "Detailed explanation of what was changed and why",
    "code": "The complete fixed code block",
    "confidence": 0.9,
    "sideEffects": ["Any potential side effects to consider"],
    "testingSuggestions": ["How to test this fix"],
    "preventiveMeasures": ["How to prevent similar issues"]
  },
  "analysis": {
    "rootCause": "Root cause analysis",
    "impact": "Impact assessment",
    "complexity": "simple|medium|complex"
  }
}

Please provide a comprehensive fix that addresses the issue completely.
    `.trim();
    }

    /**
     * Get system prompt for fix generation
     */
    getSystemPrompt() {
        return `
You are an expert software engineer and security researcher with deep knowledge of:
- Multiple programming languages (JavaScript, TypeScript, Python, Java, C#, Go, Rust, etc.)
- Security best practices and vulnerability mitigation
- Code quality and maintainability
- Framework-specific patterns and conventions
- Modern development practices

When generating fixes:
1. Prioritize security and correctness
2. Follow language and framework conventions
3. Consider performance implications
4. Ensure backward compatibility when possible
5. Add appropriate error handling
6. Include relevant comments for complex logic
7. Suggest testing strategies

Always provide complete, working code that can be directly applied.
    `.trim();
    }

    /**
     * Parse AI response into structured fix
     */
    parseFixResponse(response, issue, context) {
        if (!response || typeof response !== 'string') {
            return {
                success: false,
                error: 'Invalid response format',
                rawResponse: response,
                issue,
                context,
            };
        }
        try {
            // Try to extract JSON from response using bracket counting
            const jsonMatch = this.extractJsonFromResponse(response);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch);
                    return {
                        ...parsed,
                        success: true,
                        originalIssue: issue,
                        context,
                        rawResponse: response,
                        generatedAt: new Date().toISOString(),
                    };
                } catch (parseError) {
                    // If JSON parsing fails, fall back to text parsing but include parse error metadata
                    const fallback = { ...this.parseTextResponse(response, issue, context) };
                    fallback.parseError = parseError.message;
                    fallback.rawResponse = response;
                    return fallback;
                }
            }

            // Fallback to text parsing
            return this.parseTextResponse(response, issue, context);
        } catch (error) {
            const fallback = { ...this.parseTextResponse(response, issue, context) };
            fallback.parseError = error.message;
            return fallback;
        }
    }

    /**
     * Parse text response when JSON parsing fails
     */
    parseTextResponse(response, issue, context) {
        const lines = response.split('\n');
        // Use safer regex to prevent ReDoS attacks
        const codeMatch = response.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);

        return {
            success: true,
            fix: {
                summary: (lines.length > 0 ? lines[0] : '') || 'Generated fix',
                description: (lines.length > 1 ? lines.slice(1, 3).join('\n') : '') || 'AI-generated fix',
                code: codeMatch ? codeMatch[1].trim() : '// Fix could not be extracted',
                confidence: this.validationThreshold,
                sideEffects: ['Unknown'],
                testingSuggestions: ['Manual testing recommended'],
                preventiveMeasures: ['Code review recommended'],
            },
            analysis: {
                rootCause: 'Analyzed by AI',
                impact: 'Unknown',
                complexity: 'medium',
            },
            originalIssue: issue,
            context,
            rawResponse: response,
            generatedAt: new Date().toISOString(),
        };
    }

    /**
     * Validate generated fix
     */
    async validateFix(issue, fix, context) {
        const validation = {
            syntaxValid: false,
            logicValid: false,
            securitySafe: false,
            overallScore: 0,
        };

        try {
            // Basic syntax validation
            validation.syntaxValid = this.validateSyntax(fix.fix?.code || '', context.language);

            // Logic validation
            validation.logicValid = this.validateLogic(fix, issue, context);

            // Security validation
            validation.securitySafe = this.validateSecurity(fix.fix?.code || '', context);

            // Calculate overall score
            validation.overallScore = this.calculateValidationScore(validation);

            fix.validation = validation;
            fix.success = validation.overallScore >= this.validationThreshold;

        } catch (error) {
            this.emit('validation-error', { issue, error: error.message });
            fix.success = false;
            fix.validationError = error.message;
        }

        return fix;
    }

    /**
     * Validate code syntax
     */
    validateSyntax(code, language) {
        if (!code || typeof code !== 'string') return false;
        
        // Basic syntax validation using proper parsing libraries would be better
        switch (language) {
            case 'javascript':
            case 'typescript':
                try {
                    // Basic validation - would use @babel/parser or typescript in production
                    new Function(code);
                    return true;
                } catch {
                    return false;
                }
            case 'python':
                // Would use ast.parse() in production
                return !code.includes('IndentationError') && !code.includes('SyntaxError');
            default:
                return true; // Assume valid for unknown languages
        }
    }

    /**
     * Validate fix logic
     */
    validateLogic(fix, issue, _context) {
        // Basic logic validation
        const codeStr = fix?.fix?.code;
        if (!codeStr || typeof codeStr !== 'string' || codeStr.trim().length === 0) {
            return false;
        }

        // Check if fix addresses the original issue
        const code = codeStr.toLowerCase();
        const issueMessage = (issue?.message || '').toLowerCase();

        // Simple heuristic - check if fix contains relevant keywords
        const relevantKeywords = this.extractRelevantKeywords(issueMessage) || [];
        const hasRelevantFix = relevantKeywords.length > 0 && relevantKeywords.some(keyword =>
            code.includes(keyword.toLowerCase())
        );

        return hasRelevantFix || (fix?.fix?.confidence || 0) >= 0.8;
    }

    /**
     * Validate security of fix
     */
    validateSecurity(code, _context) {
        if (!code || typeof code !== 'string') return false;
        
        // Basic security checks - removed postMessage as it's legitimate API
        const securityPatterns = [
            /eval\s*\(/i,
            /innerHTML\s*=/i,
            /document\.write/i,
            /setTimeout\s*\(\s*['"]/i,
            /setInterval\s*\(\s*['"]/i,
            /Function\s*\(/i,
            /execScript/i,
        ];

        for (const pattern of securityPatterns) {
            if (pattern.test(code)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Extract relevant keywords from issue
     */
    extractRelevantKeywords(issueMessage) {
        if (!issueMessage || typeof issueMessage !== 'string') return [];
        
        // More efficient chained operations
        return [...new Set(
            issueMessage.split(' ')
                .filter(word => word.length > 3)
                .map(word => word.replace(/[^\w]/g, ''))
                .filter(word => word.length > 0)
        )];
    }

    /**
     * Calculate overall validation score
     */
    calculateValidationScore(validation) {
        const weights = {
            syntaxValid: 0.4,
            logicValid: 0.3,
            securitySafe: 0.3,
        };

        let score = 0;
        for (const [key, weight] of Object.entries(weights)) {
            if (validation[key]) {
                score += weight;
            }
        }

        return score;
    }

    /**
     * Apply fix to file
     */
    async applyFix(issue, fix, options = {}) {
        if (!fix.success) {
            throw new Error('Cannot apply unsuccessful fix');
        }

        try {
            const fs = await import('fs/promises');

            if (!issue.file || typeof issue.file !== 'string') {
                throw new Error('Invalid file path in issue');
            }

            // Enhanced path traversal protection
            const resolvedPath = path.resolve(issue.file);
            const normalizedPath = path.normalize(resolvedPath);
            
            // Check for path traversal attempts
            if (normalizedPath.includes('..') || !normalizedPath.startsWith(process.cwd())) {
                throw new Error('Invalid file path: path traversal detected');
            }

            const content = await fs.readFile(normalizedPath, 'utf8');

            // Apply the fix based on strategy
            const newContent = this.applyFixToContent(content, issue, fix, options);

            if (!options.dryRun) {
                await fs.writeFile(normalizedPath, newContent, 'utf8');
            }

            return {
                success: true,
                originalContent: content,
                newContent: newContent,
                changes: this.calculateChanges(content, newContent),
                dryRun: options.dryRun || false,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Apply fix to content
     */
    applyFixToContent(content, issue, fix, options = {}) {
        const lines = content.split('\n');
        
        // Validate line number
        if (!issue.line || typeof issue.line !== 'number' || issue.line < 1) {
            throw new Error('Invalid line number in issue');
        }
        
        const targetLine = issue.line - 1; // Convert to 0-based

        if (targetLine < 0 || targetLine >= lines.length) {
            throw new Error(`Invalid line number: ${issue.line}`);
        }

        if (!fix.fix?.code || typeof fix.fix.code !== 'string' || fix.fix.code.trim().length === 0) {
            throw new Error('Fix does not contain valid code');
        }
        const fixCode = fix.fix.code;

        switch (options.strategy || 'replace') {
            case 'replace':
                lines[targetLine] = fixCode;
                break;
            case 'insert-before':
                lines.splice(targetLine, 0, fixCode);
                break;
            case 'insert-after':
                lines.splice(targetLine + 1, 0, fixCode);
                break;
            case 'comment':
                lines[targetLine] = `${lines[targetLine]} // Fixed: ${fix.fix.summary}`;
                break;
        }

        return lines.join('\n');
    }

    /**
     * Calculate changes between contents
     */
    calculateChanges(original, modified) {
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');

        return {
            linesAdded: Math.max(0, modifiedLines.length - originalLines.length),
            linesRemoved: Math.max(0, originalLines.length - modifiedLines.length),
            linesModified: originalLines.length === modifiedLines.length ?
                originalLines.filter((line, i) => line !== modifiedLines[i]).length : 0,
        };
    }

    /**
     * Get fix statistics
     */
    getFixStats() {
        const stats = {
            totalFixes: 0,
            successfulFixes: 0,
            byAnalyzer: {},
            byType: {},
            byLanguage: {},
            averageConfidence: 0,
        };

        for (const [key, history] of this.fixHistory) {
            for (const fix of history) {
                stats.totalFixes++;
                if (fix.success) {
                    stats.successfulFixes++;
                }

                const [analyzer, type] = key.split('-');
                stats.byAnalyzer[analyzer] = (stats.byAnalyzer[analyzer] || 0) + 1;
                stats.byType[type] = (stats.byType[type] || 0) + 1;

                const language = this.detectLanguage(fix.issue.file);
                stats.byLanguage[language] = (stats.byLanguage[language] || 0) + 1;

                if (fix.fix && fix.fix.confidence) {
                    stats.averageConfidence += fix.fix.confidence;
                }
            }
        }

        if (stats.totalFixes > 0) {
            stats.averageConfidence /= stats.totalFixes;
            stats.successRate = (stats.successfulFixes / stats.totalFixes * 100).toFixed(1);
        }

        return stats;
    }

    /**
     * Clear fix history
     */
    clearHistory() {
        this.fixHistory.clear();
    }

    /**
     * Extract JSON from response using bracket counting
     */
    extractJsonFromResponse(response) {
        const startIndex = response.indexOf('{');
        if (startIndex === -1) return null;

        let depth = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = startIndex; i < response.length; i++) {
            const char = response[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if (char === '"' && !escaped) {
                inString = !inString;
                continue;
            }
            
            if (!inString) {
                if (char === '{') depth++;
                if (char === '}') depth--;
                if (depth === 0) {
                    return response.substring(startIndex, i + 1);
                }
            }
        }
        return null;
    }
}

export default AIFixGenerator;
