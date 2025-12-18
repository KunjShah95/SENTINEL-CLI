import { promises as fs } from 'fs';
import Handlebars from 'handlebars';

export default class ReportGenerator {
  constructor() {
    this.templates = {
      console: this.getConsoleTemplate(),
      json: this.getJsonTemplate(),
      html: this.getHtmlTemplate(),
      markdown: this.getMarkdownTemplate(),
    };
  }

  async generate(issues, options = {}) {
    const { format = 'console', outputFile = null, includeSnippets = true } = options;

    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(issues),
      issues: issues,
      metadata: {
        totalIssues: issues.length,
        filesAnalyzed: [...new Set(issues.map(issue => issue.file))].length,
        analyzers: [...new Set(issues.map(issue => issue.analyzer))],
        includeSnippets,
      },
    };

    let output;

    switch (format) {
    case 'console':
      output = this.generateConsoleReport(report);
      break;
    case 'json':
      output = JSON.stringify(report, null, 2);
      break;
    case 'junit':
      output = this.generateJUnitReport(report);
      break;
    case 'html':
      output = this.generateHtmlReport(report);
      break;
    case 'markdown':
      output = this.generateMarkdownReport(report);
      break;
    default:
      output = this.generateConsoleReport(report);
    }

    if (outputFile) {
      await fs.writeFile(outputFile, output);
    }

    return output;
  }

  generateSummary(issues) {
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const typeCounts = {};

    for (const issue of issues) {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
      typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
    }

    return {
      severityCounts,
      typeCounts,
      totalIssues: issues.length,
      criticalIssues: severityCounts.critical + severityCounts.high,
    };
  }

  generateConsoleReport(report) {
    const { summary, issues } = report;
    const lines = [];

    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                🚀 SMART CODE REVIEW BOT                   ║');
    lines.push('║                    Analysis Report                        ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`📅 Analysis Date: ${new Date().toLocaleString()}`);
    lines.push(`📊 Total Issues: ${summary.totalIssues}`);
    lines.push(`📁 Files Analyzed: ${report.metadata.filesAnalyzed}`);
    lines.push('');

    // Severity breakdown
    lines.push('📈 Issues by Severity:');
    const severityEmojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    };

    for (const [severity, count] of Object.entries(summary.severityCounts)) {
      if (count > 0) {
        const emoji = severityEmojis[severity] || '⚪';
        lines.push(`   ${emoji} ${severity.toUpperCase()}: ${count}`);
      }
    }

    // Type breakdown
    lines.push('');
    lines.push('🏷️ Issues by Type:');
    for (const [type, count] of Object.entries(summary.typeCounts)) {
      lines.push(`   • ${type.toUpperCase()}: ${count}`);
    }

    lines.push('');
    lines.push('─'.repeat(60));

    // Detailed issues
    if (issues.length > 0) {
      lines.push('');
      lines.push('🔍 Detailed Issues:');
      lines.push('');

      // Group by severity
      const groupedIssues = {};
      for (const issue of issues) {
        if (!groupedIssues[issue.severity]) {
          groupedIssues[issue.severity] = [];
        }
        groupedIssues[issue.severity].push(issue);
      }

      const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

      for (const severity of severityOrder) {
        const severityIssues = groupedIssues[severity];
        if (!severityIssues || severityIssues.length === 0) continue;

        const emoji = severityEmojis[severity] || '⚪';
        lines.push(`${emoji} ${severity.toUpperCase()} Issues (${severityIssues.length}):`);
        lines.push('');

        for (const issue of severityIssues) {
          lines.push(`   📄 ${issue.file}:${issue.line}${issue.column ? ':' + issue.column : ''}`);
          lines.push(`   🏷️  ${issue.title}`);
          lines.push(`   📝 ${issue.message}`);
          lines.push(`   🔧 ${issue.analyzer}`);

          if (issue.snippet && report.metadata.includeSnippets) {
            lines.push('   💻 Code:');
            const snippetLines = issue.snippet.split('\n').slice(0, 5);
            for (const line of snippetLines) {
              lines.push(`      ${line}`);
            }
          }

          if (issue.suggestion) {
            lines.push(`   💡 Suggestion: ${issue.suggestion}`);
          }

          lines.push('');
        }

        lines.push('');
      }
    } else {
      lines.push('');
      lines.push('🎉 Congratulations! No issues found.');
      lines.push('');
    }

    lines.push('─'.repeat(60));
    lines.push('Generated by Sentinel 🚀');

    return lines.join('\n');
  }

  generateJsonReport(report) {
    return JSON.stringify(report, null, 2);
  }

  generateHtmlReport(report) {
    const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #007bff; }
        .severity-critical { border-left-color: #dc3545; }
        .severity-high { border-left-color: #fd7e14; }
        .severity-medium { border-left-color: #ffc107; }
        .severity-low { border-left-color: #20c997; }
        .severity-info { border-left-color: #6c757d; }
        .issue { margin-bottom: 20px; padding: 20px; border: 1px solid #dee2e6; border-radius: 6px; }
        .issue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .severity-badge { padding: 4px 8px; border-radius: 4px; color: white; font-size: 0.8em; font-weight: bold; }
        .badge-critical { background-color: #dc3545; }
        .badge-high { background-color: #fd7e14; }
        .badge-medium { background-color: #ffc107; color: #212529; }
        .badge-low { background-color: #20c997; }
        .badge-info { background-color: #6c757d; }
        .issue-title { font-weight: bold; margin-bottom: 5px; }
        .issue-file { color: #6c757d; font-size: 0.9em; }
        .issue-message { margin: 10px 0; }
        .code-snippet { background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.9em; overflow-x: auto; }
        .suggestion { background: #e3f2fd; padding: 10px; border-radius: 4px; margin-top: 10px; border-left: 4px solid #2196f3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Sentinel Report</h1>
            <p>Analysis completed on {{timestamp}}</p>
        </div>
        <div class="content">
            <div class="summary">
                <div class="summary-card">
                    <h3>📊 Total Issues</h3>
                    <p style="font-size: 2em; margin: 0; color: #007bff;">{{summary.totalIssues}}</p>
                </div>
                <div class="summary-card severity-critical">
                    <h3>🔴 Critical</h3>
                    <p style="font-size: 2em; margin: 0; color: #dc3545;">{{summary.severityCounts.critical}}</p>
                </div>
                <div class="summary-card severity-high">
                    <h3>🟠 High</h3>
                    <p style="font-size: 2em; margin: 0; color: #fd7e14;">{{summary.severityCounts.high}}</p>
                </div>
                <div class="summary-card severity-medium">
                    <h3>🟡 Medium</h3>
                    <p style="font-size: 2em; margin: 0; color: #ffc107;">{{summary.severityCounts.medium}}</p>
                </div>
            </div>
            
            {{#if issues}}
                <h2>🔍 Issues Found ({{issues.length}})</h2>
                {{#each issues}}
                    <div class="issue">
                        <div class="issue-header">
                            <div>
                                <div class="issue-title">{{this.title}}</div>
                                <div class="issue-file">{{this.file}}:{{this.line}}{{#if this.column}}:{{this.column}}{{/if}}</div>
                            </div>
                            <span class="severity-badge badge-{{this.severity}}">{{this.severity}}</span>
                        </div>
                        <div class="issue-message">{{this.message}}</div>
                        {{#if this.snippet}}
                            <div class="code-snippet">{{this.snippet}}</div>
                        {{/if}}
                        {{#if this.suggestion}}
                            <div class="suggestion">
                                <strong>💡 Suggestion:</strong> {{this.suggestion}}
                            </div>
                        {{/if}}
                    </div>
                {{/each}}
            {{else}}
                <div style="text-align: center; padding: 40px; color: #28a745;">
                    <h2>🎉 No Issues Found!</h2>
                    <p>Great job! Your code looks clean.</p>
                </div>
            {{/if}}
        </div>
    </div>
</body>
</html>
    `;

    return Handlebars.compile(template)(report);
  }

  generateMarkdownReport(report) {
    const { summary, issues } = report;
    const lines = [];

    lines.push('# 🚀 Sentinel Report');
    lines.push('');
    lines.push(`**Analysis Date:** ${new Date().toLocaleString()}`);
    lines.push(`**Total Issues:** ${summary.totalIssues}`);
    lines.push(`**Files Analyzed:** ${report.metadata.filesAnalyzed}`);
    lines.push('');

    // Summary table
    lines.push('## 📊 Summary');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    for (const [severity, count] of Object.entries(summary.severityCounts)) {
      if (count > 0) {
        const emoji =
          severity === 'critical'
            ? '🔴'
            : severity === 'high'
              ? '🟠'
              : severity === 'medium'
                ? '🟡'
                : severity === 'low'
                  ? '🔵'
                  : 'ℹ️';
        lines.push(`| ${emoji} ${severity.toUpperCase()} | ${count} |`);
      }
    }
    lines.push('');

    // Issues section
    if (issues.length > 0) {
      lines.push('## 🔍 Issues Found');
      lines.push('');

      for (const issue of issues) {
        lines.push(`### ${issue.title}`);
        lines.push('');
        lines.push(
          `**File:** \`${issue.file}:${issue.line}${issue.column ? ':' + issue.column : ''}\``
        );
        lines.push(`**Severity:** ${issue.severity.toUpperCase()}`);
        lines.push(`**Type:** ${issue.type.toUpperCase()}`);
        lines.push(`**Analyzer:** ${issue.analyzer}`);
        lines.push('');
        lines.push(`${issue.message}`);
        lines.push('');

        if (issue.snippet && report.metadata.includeSnippets) {
          lines.push('**Code:**');
          lines.push('```');
          lines.push(issue.snippet);
          lines.push('```');
          lines.push('');
        }

        if (issue.suggestion) {
          lines.push(`**💡 Suggestion:** ${issue.suggestion}`);
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      }
    } else {
      lines.push('## 🎉 No Issues Found!');
      lines.push('');
      lines.push('Congratulations! Your code looks clean and follows best practices.');
      lines.push('');
    }

    lines.push('_Generated by Sentinel 🚀_');

    return lines.join('\n');
  }

  generateJUnitReport(report) {
    const suiteName = 'sentinel-analysis';
    const testCases = report.issues.map(issue => {
      const name = `${issue.file}:${issue.line || 1} ${issue.title}`;
      const classname = issue.file || 'unknown';
      const message = `${issue.severity.toUpperCase()} [${issue.analyzer || 'analyzer'}]: ${issue.message}`;
      const details = issue.suggestion ? `${issue.message}\nSuggestion: ${issue.suggestion}` : issue.message;
      return {
        name: this.escapeXml(name),
        classname: this.escapeXml(classname),
        message: this.escapeXml(message),
        details: this.escapeXml(details),
      };
    });

    const tests = testCases.length;
    const failures = tests; // every issue is a failure in the test suite

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${tests}" failures="${failures}">`,
      `  <testsuite name="${suiteName}" tests="${tests}" failures="${failures}">`,
    ];

    for (const test of testCases) {
      xml.push(
        `    <testcase classname="${test.classname}" name="${test.name}">`,
        `      <failure message="${test.message}">${test.details}</failure>`,
        '    </testcase>'
      );
    }

    // Emit an empty testcase when there are no issues so CI shows pass
    if (testCases.length === 0) {
      xml.push('    <testcase classname="sentinel" name="No issues found" />');
    }

    xml.push('  </testsuite>', '</testsuites>');

    return xml.join('\n');
  }

  escapeXml(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  getConsoleTemplate() {
    return 'console';
  }

  getJsonTemplate() {
    return 'json';
  }

  getHtmlTemplate() {
    return 'html';
  }

  getMarkdownTemplate() {
    return 'markdown';
  }
}
