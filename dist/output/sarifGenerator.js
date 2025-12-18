import { promises as fs } from 'fs';
/**
 * SarifGenerator - Generates SARIF (Static Analysis Results Interchange Format) output
 * Compatible with GitHub Security tab and other SARIF viewers
 * @see https://sarifweb.azurewebsites.net/
 */
export class SarifGenerator {
    constructor(options = {}) {
        this.toolName = options.toolName || 'Sentinel CLI';
        this.toolVersion = options.toolVersion || '1.2.2';
        this.toolUri = options.toolUri || 'https://github.com/KunjShah95/Sentinel-CLI';
    }

    /**
     * Convert Sentinel severity to SARIF level
     */
    mapSeverityToLevel(severity) {
        const mapping = {
            critical: 'error',
            high: 'error',
            medium: 'warning',
            low: 'note',
            info: 'note',
        };
        return mapping[severity] || 'warning';
    }

    /**
     * Convert Sentinel severity to SARIF security-severity score (0.0 - 10.0)
     */
    mapSeverityToScore(severity) {
        const mapping = {
            critical: 9.5,
            high: 7.5,
            medium: 5.0,
            low: 2.5,
            info: 1.0,
        };
        return mapping[severity] || 5.0;
    }

    /**
     * Generate unique rule ID from issue
     */
    generateRuleId(issue) {
        const type = issue.type || 'unknown';
        const title = (issue.title || 'issue').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `sentinel/${type}/${title}`.substring(0, 100);
    }

    /**
     * Generate SARIF report from Sentinel issues
     * @param {Array} issues - Sentinel analysis issues
     * @param {Object} options - Generation options
     * @returns {Object} SARIF JSON object
     */
    generate(issues, _options = {}) {
        const rules = new Map();
        const results = [];

        // Process issues and collect unique rules
        for (const issue of issues) {
            const ruleId = this.generateRuleId(issue);

            // Add rule if not already added
            if (!rules.has(ruleId)) {
                rules.set(ruleId, {
                    id: ruleId,
                    name: issue.title || 'Unknown Issue',
                    shortDescription: {
                        text: issue.title || 'Unknown Issue',
                    },
                    fullDescription: {
                        text: issue.message || issue.title || 'No description available',
                    },
                    help: {
                        text: issue.suggestion || 'No remediation guidance available',
                        markdown: issue.suggestion
                            ? `**Suggestion:** ${issue.suggestion}`
                            : 'No remediation guidance available',
                    },
                    properties: {
                        category: issue.type || 'general',
                        tags: issue.tags || [],
                        'security-severity': String(this.mapSeverityToScore(issue.severity)),
                    },
                });
            }

            // Create result
            const result = {
                ruleId,
                level: this.mapSeverityToLevel(issue.severity),
                message: {
                    text: issue.message || issue.title,
                },
                locations: [
                    {
                        physicalLocation: {
                            artifactLocation: {
                                uri: issue.file.replace(/\\/g, '/'),
                                uriBaseId: '%SRCROOT%',
                            },
                            region: {
                                startLine: issue.line || 1,
                                startColumn: issue.column || 1,
                            },
                        },
                    },
                ],
                properties: {
                    analyzer: issue.analyzer || 'unknown',
                    severity: issue.severity,
                },
            };

            // Add code snippet if available
            if (issue.snippet) {
                result.locations[0].physicalLocation.region.snippet = {
                    text: issue.snippet,
                };
            }

            // Add fix suggestion if available
            if (issue.suggestion) {
                result.fixes = [
                    {
                        description: {
                            text: issue.suggestion,
                        },
                    },
                ];
            }

            results.push(result);
        }

        // Build SARIF structure
        const sarif = {
            $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
            version: '2.1.0',
            runs: [
                {
                    tool: {
                        driver: {
                            name: this.toolName,
                            version: this.toolVersion,
                            informationUri: this.toolUri,
                            rules: Array.from(rules.values()),
                        },
                    },
                    results,
                    invocations: [
                        {
                            executionSuccessful: true,
                            endTimeUtc: new Date().toISOString(),
                        },
                    ],
                },
            ],
        };

        return sarif;
    }

    /**
     * Generate and save SARIF report to file
     */
    async saveToFile(issues, outputPath) {
        const path = await import('path');
        
        // Validate and sanitize output path
        const normalizedPath = path.normalize(outputPath);
        if (normalizedPath.includes('..')) {
            throw new Error('Path traversal detected in output path');
        }
        
        const sarif = this.generate(issues);
        await fs.writeFile(normalizedPath, JSON.stringify(sarif, null, 2), 'utf8');
        return normalizedPath;
    }
}

export default SarifGenerator;
