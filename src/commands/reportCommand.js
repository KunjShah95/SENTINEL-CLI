import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { CodeReviewBot } from '../core/bot.js';
import Config from '../config/config.js';

export class ReportCommand {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
    }

    async run(args) {
        const format = this.parseFormat(args);
        const options = this.parseOptions(args);
        
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan('  ') + chalk.white(`Sentinel Report (${format.toUpperCase()})`));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

        console.log(chalk.gray('  Generating report...\n'));
        
        const analysis = await this.runAnalysis(options);
        
        switch (format) {
            case 'html':
                return this.generateHtmlReport(analysis, options);
            case 'markdown':
                return this.generateMarkdownReport(analysis, options);
            case 'json':
                return this.generateJsonReport(analysis, options);
            case 'csv':
                return this.generateCsvReport(analysis, options);
            case 'junit':
                return this.generateJUnitReport(analysis, options);
            case 'sarif':
                return this.generateSarifReport(analysis, options);
            default:
                console.log(chalk.red('  Unknown format: ' + format));
        }
    }

    parseFormat(args) {
        const formats = ['html', 'markdown', 'json', 'csv', 'junit', 'sarif'];
        for (const arg of args) {
            if (formats.includes(arg.toLowerCase())) {
                return arg.toLowerCase();
            }
        }
        return 'html';
    }

    parseOptions(args) {
        const options = {
            analyzers: ['security', 'quality', 'bugs', 'dependency'],
            output: null,
            minSeverity: 'low'
        };

        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--output' || args[i] === '-o') {
                options.output = args[i + 1];
                i++;
            } else if (args[i] === '--analyzers') {
                options.analyzers = args[i + 1].split(',');
                i++;
            } else if (args[i] === '--min-severity') {
                options.minSeverity = args[i + 1];
                i++;
            }
        }

        return options;
    }

    async runAnalysis(options) {
        const config = new Config();
        await config.load();

        const bot = new CodeReviewBot();
        await bot.initialize();

        const files = await glob('**/*.{js,ts,jsx,tsx,py,java,go,rs}', {
            cwd: this.projectPath,
            ignore: ['node_modules/**', 'dist/**', 'build/**']
        });

        const result = await bot.runAnalysis({
            files: files.slice(0, 100),
            analyzers: options.analyzers,
            format: 'json',
            silent: true
        });

        return result || { issues: [], summary: {} };
    }

    async generateHtmlReport(analysis, options) {
        const severityColors = {
            critical: '#dc2626',
            high: '#ea580c',
            medium: '#ca8a04',
            low: '#2563eb'
        };

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sentinel Security Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0; }
        h1 { color: #38bdf8; border-bottom: 2px solid #1e293b; padding-bottom: 10px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
        .stat { background: #1e293b; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; }
        .stat-label { color: #94a3b8; font-size: 0.9em; }
        .critical { color: #dc2626; }
        .high { color: #ea580c; }
        .medium { color: #ca8a04; }
        .low { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
        th { background: #1e293b; color: #94a3b8; }
        .issue { background: #1e293b; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; margin-right: 8px; }
    </style>
</head>
<body>
    <h1>🛡️ Sentinel Security Report</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    
    <div class="summary">
        <div class="stat"><div class="stat-value">${analysis.issues?.length || 0}</div><div class="stat-label">Total Issues</div></div>
        <div class="stat"><div class="stat-value critical">${analysis.issues?.filter(i => i.severity === 'critical').length || 0}</div><div class="stat-label">Critical</div></div>
        <div class="stat"><div class="stat-value high">${analysis.issues?.filter(i => i.severity === 'high').length || 0}</div><div class="stat-label">High</div></div>
        <div class="stat"><div class="stat-value">${analysis.issues?.filter(i => i.severity === 'medium').length || 0}</div><div class="stat-label">Medium</div></div>
    </div>

    <h2>Issues</h2>
    ${(analysis.issues || []).map(issue => `
    <div class="issue" style="border-left-color: ${severityColors[issue.severity] || '#666'}">
        <span class="badge" style="background: ${severityColors[issue.severity] || '#666'}">${issue.severity}</span>
        <strong>${issue.message}</strong>
        <p>${issue.file}:${issue.line || 'N/A'}</p>
        ${issue.suggestion ? `<p><em>Suggestion: ${issue.suggestion}</em></p>` : ''}
    </div>
    `).join('')}
</body>
</html>`;

        const outputPath = options.output || path.join(this.projectPath, 'sentinel-report.html');
        await fs.writeFile(outputPath, html, 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    async generateMarkdownReport(analysis, options) {
        const md = `# 🛡️ Sentinel Security Report

Generated: ${new Date().toISOString()}

## Summary

| Severity | Count |
|----------|-------|
| Critical | ${analysis.issues?.filter(i => i.severity === 'critical').length || 0} |
| High | ${analysis.issues?.filter(i => i.severity === 'high').length || 0} |
| Medium | ${analysis.issues?.filter(i => i.severity === 'medium').length || 0} |
| Low | ${analysis.issues?.filter(i => i.severity === 'low').length || 0} |
| **Total** | ${analysis.issues?.length || 0} |

## Issues

${(analysis.issues || []).map(issue => `### ${issue.severity?.toUpperCase()}: ${issue.message}

- **File:** \`${issue.file}\`
- **Line:** ${issue.line || 'N/A'}
- **Analyzer:** ${issue.analyzer || 'N/A'}
${issue.suggestion ? `- **Suggestion:** ${issue.suggestion}` : ''}

---`).join('\n')}

## Recommendations

${this.getRecommendations(analysis)}
`;

        const outputPath = options.output || path.join(this.projectPath, 'sentinel-report.md');
        await fs.writeFile(outputPath, md, 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    async generateJsonReport(analysis, options) {
        const outputPath = options.output || path.join(this.projectPath, 'sentinel-report.json');
        await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2), 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    async generateCsvReport(analysis, options) {
        const header = 'Severity,File,Line,Message,Analyzer,Suggestion\n';
        const rows = (analysis.issues || []).map(issue => 
            `${issue.severity || 'unknown'},${issue.file || ''},${issue.line || ''},"${(issue.message || '').replace(/"/g, '""')}",${issue.analyzer || ''},"${(issue.suggestion || '').replace(/"/g, '""')}"`
        ).join('\n');

        const outputPath = options.output || path.join(this.projectPath, 'sentinel-report.csv');
        await fs.writeFile(outputPath, header + rows, 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    async generateJUnitReport(analysis, options) {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="sentinel" tests="${analysis.issues?.length || 0}" failures="${analysis.issues?.filter(i => i.severity === 'critical' || i.severity === 'high').length || 0}" errors="0" time="0">
${(analysis.issues || []).map(issue => `  <testcase name="${(issue.message || 'Unknown').substring(0, 50)}" classname="${issue.file}">
    <failure message="${issue.message}" type="${issue.severity}">${issue.message}${issue.suggestion ? '\\n' + issue.suggestion : ''}</failure>
  </testcase>`).join('\n')}
</testsuite>`;

        const outputPath = options.output || path.join(this.projectPath, 'sentinel-results.xml');
        await fs.writeFile(outputPath, xml, 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    async generateSarifReport(analysis, options) {
        const sarif = {
            version: '2.1.0',
            $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
            runs: [{
                tool: {
                    driver: {
                        name: 'Sentinel',
                        version: '1.9.0',
                        informationUri: 'https://github.com/KunjShah95/SENTINEL-CLI'
                    }
                },
                results: (analysis.issues || []).map(issue => ({
                    ruleId: issue.analyzer || 'unknown',
                    level: issue.severity === 'critical' || issue.severity === 'high' ? 'error' : 'warning',
                    message: { text: issue.message },
                    locations: [{
                        physicalLocation: {
                            artifactLocation: { uri: issue.file },
                            region: { startLine: issue.line || 1 }
                        }
                    }]
                }))
            }]
        };

        const outputPath = options.output || path.join(this.projectPath, 'sentinel-results.sarif');
        await fs.writeFile(outputPath, JSON.stringify(sarif, null, 2), 'utf8');
        
        console.log(chalk.green(`  ✓ Report saved to ${outputPath}`));
        return { success: true, path: outputPath };
    }

    getRecommendations(analysis) {
        const recs = [];
        const criticalCount = analysis.issues?.filter(i => i.severity === 'critical').length || 0;
        const highCount = analysis.issues?.filter(i => i.severity === 'high').length || 0;

        if (criticalCount > 0) recs.push('- 🔴 Address critical issues immediately');
        if (highCount > 0) recs.push('- 🟡 Fix high severity issues in this sprint');
        if (recs.length === 0) recs.push('- ✅ No critical issues found - keep it up!');

        return recs.join('\n');
    }
}

export async function runReportCommand(args, options = {}) {
    const command = new ReportCommand(options);
    return command.run(args);
}

export default { ReportCommand, runReportCommand };
