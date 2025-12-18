import BaseAnalyzer from './baseAnalyzer.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * CustomAnalyzer - Allows users to define custom regex-based rules
 * Reads rules from .sentinelrules.yaml or .sentinelrules.json
 */
export class CustomAnalyzer extends BaseAnalyzer {
    constructor(config) {
        super('CustomAnalyzer', config);
        this.rules = [];
        this.rulesLoaded = false;
    }

    /**
     * Load rules from the project root
     */
    async loadRules() {
        if (this.rulesLoaded) return;

        const possibleFiles = [
            '.sentinelrules.yaml',
            '.sentinelrules.yml',
            '.sentinelrules.json',
        ];

        for (const filename of possibleFiles) {
            const filePath = path.resolve(process.cwd(), filename);
            try {
                const content = await fs.readFile(filePath, 'utf8');

                if (filename.endsWith('.json')) {
                    const parsed = JSON.parse(content);
                    this.rules = parsed.rules || [];
                } else {
                    // Simple YAML parsing for our specific format
                    this.rules = this.parseSimpleYaml(content);
                }

                this.rulesLoaded = true;
                console.log(`[CustomAnalyzer] Loaded ${this.rules.length} rules from ${filename}`);
                return;
            } catch (error) {
                // File doesn't exist or can't be parsed, try next
                continue;
            }
        }

        // No rules file found - that's okay
        this.rulesLoaded = true;
    }

    /**
     * Simple YAML parser for our rule format
     * Supports basic structure without full YAML lib dependency
     */
    parseSimpleYaml(content) {
        const rules = [];
        const lines = content.split('\n');
        let currentRule = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;

            // New rule starts with "- id:"
            if (trimmed.startsWith('- id:')) {
                if (currentRule && currentRule.id) {
                    rules.push(currentRule);
                }
                currentRule = { id: trimmed.replace('- id:', '').trim() };
            } else if (currentRule) {
                // Parse rule properties
                if (trimmed.startsWith('pattern:')) {
                    currentRule.pattern = trimmed.replace('pattern:', '').trim().replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('message:')) {
                    currentRule.message = trimmed.replace('message:', '').trim().replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('severity:')) {
                    currentRule.severity = trimmed.replace('severity:', '').trim();
                } else if (trimmed.startsWith('filePattern:')) {
                    currentRule.filePattern = trimmed.replace('filePattern:', '').trim().replace(/^["']|["']$/g, '');
                } else if (trimmed.startsWith('suggestion:')) {
                    currentRule.suggestion = trimmed.replace('suggestion:', '').trim().replace(/^["']|["']$/g, '');
                }
            }
        }

        // Don't forget the last rule
        if (currentRule && currentRule.id) {
            rules.push(currentRule);
        }

        return rules;
    }

    async analyze(files, context) {
        await this.loadRules();

        if (this.rules.length === 0) {
            return [];
        }

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

        for (const rule of this.rules) {
            // Check if rule applies to this file type
            if (rule.filePattern) {
                const fileRegex = new RegExp(rule.filePattern);
                if (!fileRegex.test(filePath)) {
                    continue;
                }
            }

            // Skip rules without patterns
            if (!rule.pattern) continue;

            try {
                const regex = new RegExp(rule.pattern, 'gi');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const matches = line.match(regex);

                    if (matches) {
                        this.addIssue({
                            severity: rule.severity || 'warning',
                            type: 'custom',
                            title: rule.id || 'Custom Rule Violation',
                            message: rule.message || `Pattern matched: ${rule.pattern}`,
                            file: filePath,
                            line: i + 1,
                            column: line.indexOf(matches[0]) + 1,
                            snippet: line.trim(),
                            suggestion: rule.suggestion || null,
                            tags: ['custom', rule.id],
                            analyzer: this.name,
                        });
                    }
                }
            } catch (regexError) {
                console.warn(`[CustomAnalyzer] Invalid regex in rule ${rule.id}: ${regexError.message}`);
            }
        }
    }
}

export default CustomAnalyzer;
