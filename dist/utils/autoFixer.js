import { promises as fs } from 'fs';
import path from 'path';

/**
 * AutoFixer - Automatically fixes certain types of issues
 * Supports safe, reversible fixes for common patterns
 */
export class AutoFixer {
    constructor() {
        this.fixers = this.initializeFixers();
        this.appliedFixes = [];
    }

    initializeFixers() {
        return {
            // Accessibility fixes
            'missing-alt-text': {
                pattern: /<img([^>]*?)(?<!\balt\s*=\s*["'][^"']*["'])([^>]*?)>/gi,
                fix: (match, before, after) => {
                    // Add a placeholder alt attribute
                    return `<img${before} alt="Image description"${after}>`;
                },
                description: 'Add placeholder alt text to images',
            },

            // Security fixes
            'remove-console-log': {
                pattern: /console\.log\([^)]*\);?\n?/g,
                fix: () => '',
                description: 'Remove console.log statements',
            },

            // Code quality fixes
            'remove-debugger': {
                pattern: /\bdebugger\b;?\n?/g,
                fix: () => '',
                description: 'Remove debugger statements',
            },

            // Trailing whitespace
            'trailing-whitespace': {
                pattern: /[ \t]+$/gm,
                fix: () => '',
                description: 'Remove trailing whitespace',
            },

            // Multiple empty lines
            'multiple-empty-lines': {
                pattern: /\n{3,}/g,
                fix: () => '\n\n',
                description: 'Reduce multiple empty lines to maximum of one',
            },
        };
    }

    /**
     * Get list of available fix types
     */
    getAvailableFixTypes() {
        return Object.keys(this.fixers).map(key => ({
            id: key,
            description: this.fixers[key].description,
        }));
    }

    /**
     * Apply fixes to a single file
     * @param {string} filePath - Path to the file
     * @param {string} content - File content
     * @param {string[]} fixTypes - Types of fixes to apply (or 'all')
     * @returns {{ content: string, fixes: Array }}
     */
    applyFixes(filePath, content, fixTypes = ['all']) {
        let modifiedContent = content;
        const fixes = [];
        const applyAll = fixTypes.includes('all');

        for (const [fixType, fixer] of Object.entries(this.fixers)) {
            if (!applyAll && !fixTypes.includes(fixType)) continue;

            const matches = modifiedContent.match(fixer.pattern);
            if (matches && matches.length > 0) {
                const originalContent = modifiedContent;

                if (typeof fixer.fix === 'function') {
                    modifiedContent = modifiedContent.replace(fixer.pattern, fixer.fix);
                } else {
                    modifiedContent = modifiedContent.replace(fixer.pattern, fixer.fix);
                }

                if (originalContent !== modifiedContent) {
                    fixes.push({
                        type: fixType,
                        description: fixer.description,
                        count: matches.length,
                        file: filePath,
                    });
                }
            }
        }

        return {
            content: modifiedContent,
            fixes,
            hasChanges: fixes.length > 0,
        };
    }

    /**
     * Apply fixes to multiple files
     * @param {Array<{path: string, content: string}>} files
     * @param {string[]} fixTypes
     * @returns {Promise<Array>}
     */
    async applyFixesToFiles(files, fixTypes = ['all']) {
        const results = [];

        for (const file of files) {
            const result = this.applyFixes(file.path, file.content, fixTypes);

            if (result.hasChanges) {
                results.push({
                    file: file.path,
                    fixes: result.fixes,
                    newContent: result.content,
                });
            }
        }

        return results;
    }

    /**
     * Write fixed content back to files
     * @param {Array} fixResults - Results from applyFixesToFiles
     * @param {boolean} dryRun - If true, don't actually write
     */
    async writeFixedFiles(fixResults, dryRun = false) {
        const written = [];

        for (const result of fixResults) {
            if (!dryRun) {
                const absolutePath = path.resolve(result.file);
                await fs.writeFile(absolutePath, result.newContent, 'utf8');
            }

            written.push({
                file: result.file,
                fixes: result.fixes,
                dryRun,
            });
        }

        return written;
    }

    /**
     * Generate a summary of fixes applied
     */
    generateSummary(fixResults) {
        const summary = {
            totalFiles: fixResults.length,
            totalFixes: 0,
            byType: {},
        };

        for (const result of fixResults) {
            for (const fix of result.fixes) {
                summary.totalFixes += fix.count;
                summary.byType[fix.type] = (summary.byType[fix.type] || 0) + fix.count;
            }
        }

        return summary;
    }
}

export default AutoFixer;
