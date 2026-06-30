import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class GitLabFormatConverter {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
  }

  async convertToGitLabFormat(analysisResult) {
    const sarif = this.generateGitLabSARIF(analysisResult);
    return sarif;
  }

  generateGitLabSARIF(analysisResult) {
    const issues = analysisResult.issues || [];

    const runs = [{
      tool: {
        driver: {
          name: 'Sentinel',
          version: '1.9.0',
          informationUri: 'https://sentinel-cli.dev'
        }
      },
      results: issues.map(issue => ({
        ruleId: issue.analyzer || 'sentinel',
        level: this.mapSeverity(issue.severity),
        message: {
          text: issue.message
        },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: issue.file
            },
            region: {
              startLine: issue.line || 1
            }
          }
        }]
      }))
    }];

    return {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs
    };
  }

  mapSeverity(severity) {
    const map = {
      critical: 'error',
      high: 'error',
      medium: 'warning',
      low: 'note',
      info: 'note'
    };
    return map[severity] || 'note';
  }

  async generateCodeQualityReport(issues) {
    const report = issues.map(issue => ({
      description: {
        name: issue.analyzer || 'Sentinel',
        content: issue.message
      },
      fingerprint: this.generateFingerprint(issue),
      severity: this.mapSeverity(issue.severity),
      location: {
        path: issue.file,
        lines: {
          begin: issue.line || 1
        }
      }
    }));

    return report;
  }

  generateFingerprint(issue) {
    const str = `${issue.file}:${issue.line}:${issue.message}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export async function runGitLabConverter(args, options = {}) {
  const converter = new GitLabFormatConverter(options);

  if (args.includes('--help')) {
    console.log(chalk.cyan('\n  GitLab Format Converter\n'));
    console.log(chalk.gray('  Usage:'));
    console.log(chalk.cyan('    sentinel gitlab <input-file> [options]'));
    console.log(chalk.gray('\n  Options:'));
    console.log(chalk.gray('    --output <file>   Output file'));
    console.log(chalk.gray('    --codequality     Generate Code Quality JSON'));
    console.log(chalk.gray('    --sarif           Generate SARIF (default)\n'));
    return;
  }

  const inputFile = args[0];
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1];
  const format = args.includes('--codequality') ? 'codequality' : 'sarif';

  if (!inputFile) {
    console.log(chalk.red('  Error: Input file required'));
    return;
  }

  try {
    const content = await fs.readFile(path.join(process.cwd(), inputFile), 'utf8');
    const analysis = JSON.parse(content);

    let result;
    if (format === 'codequality') {
      result = await converter.generateCodeQualityReport(analysis.issues || []);
    } else {
      result = await converter.convertToGitLabFormat(analysis);
    }

    const output = outputFile || `sentinel-results.${format === 'codequality' ? 'json' : 'sarif'}`;
    await fs.writeFile(output, JSON.stringify(result, null, 2));

    console.log(chalk.green(`  ✓ Generated ${output}`));
  } catch (e) {
    console.log(chalk.red(`  Error: ${e.message}`));
  }
}

export default { GitLabFormatConverter, runGitLabConverter };
