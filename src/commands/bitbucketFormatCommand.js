import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class BitbucketFormatConverter {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
  }

  async convert(analysisResult) {
    const issues = analysisResult.issues || [];

    const report = {
      title: 'Sentinel Security Report',
      generated_on: new Date().toISOString(),
      scanner: {
        id: 'sentinel',
        name: 'Sentinel CLI',
        version: '1.9.0'
      },
      issues: issues.map(issue => this.formatIssue(issue))
    };

    return report;
  }

  formatIssue(issue) {
    const severityMap = {
      critical: 'HIGH',
      high: 'HIGH',
      medium: 'MEDIUM',
      low: 'LOW'
    };

    return {
      type: 'VARIANT',
      uuid: this.generateUUID(),
      external_id: `${issue.analyzer || 'sentinel'}-${issue.line || 0}`,
      title: issue.message,
      description: issue.suggestion || issue.message,
      severity: severityMap[issue.severity] || 'LOW',
      status: 'OPEN',
      file: issue.file,
      line: issue.line || 1,
      detector: {
        name: issue.analyzer || 'Sentinel'
      }
    };
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async generateAnnotations(issues) {
    return issues.map(issue => ({
      path: issue.file,
      line: issue.line || 1,
      message: issue.message,
      severity: issue.severity === 'critical' || issue.severity === 'high' ? 'HIGH' : 'MEDIUM'
    }));
  }
}

export async function runBitbucketConverter(args, options = {}) {
  const converter = new BitbucketFormatConverter(options);

  if (args.includes('--help')) {
    console.log(chalk.cyan('\n  Bitbucket Format Converter\n'));
    console.log(chalk.gray('  Usage:'));
    console.log(chalk.cyan('    sentinel bitbucket <input-file> [options]'));
    console.log(chalk.gray('\n  Options:'));
    console.log(chalk.gray('    --output <file>   Output file'));
    console.log(chalk.gray('    --annotations    Generate PR annotations\n'));
    return;
  }

  const inputFile = args[0];
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1];
  const annotations = args.includes('--annotations');

  if (!inputFile) {
    console.log(chalk.red('  Error: Input file required'));
    return;
  }

  try {
    const content = await fs.readFile(path.join(process.cwd(), inputFile), 'utf8');
    const analysis = JSON.parse(content);

    let result;
    if (annotations) {
      result = await converter.generateAnnotations(analysis.issues || []);
    } else {
      result = await converter.convert(analysis);
    }

    const output = outputFile || 'sentinel-results.json';
    await fs.writeFile(output, JSON.stringify(result, null, 2));

    console.log(chalk.green(`  ✓ Generated ${output}`));
  } catch (e) {
    console.log(chalk.red(`  Error: ${e.message}`));
  }
}

export default { BitbucketFormatConverter, runBitbucketConverter };
