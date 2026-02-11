import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import SecretsScanner from '../../analyzers/secretsScanner.js';

export async function scanSecrets(targetPath, options = {}) {
  const spinner = ora('Initializing secrets scanner...').start();

  try {
    const scanner = new SecretsScanner({
      entropyThreshold: options.entropyThreshold || 4.5,
    });

    spinner.text = 'Discovering files...';

    const files = await discoverFiles(targetPath, options);

    if (files.length === 0) {
      spinner.warn('No files to scan');
      return;
    }

    spinner.text = `Scanning ${files.length} files for secrets...`;

    const allSecrets = [];

    for (const file of files) {
      const secrets = await scanner.scan(file.content, file.path);
      allSecrets.push(...secrets);
    }

    spinner.succeed(`Scan complete. Found ${allSecrets.length} potential secrets.`);

    if (allSecrets.length > 0) {
      displaySecrets(allSecrets, options);

      if (options.failOnSecrets && allSecrets.length > 0) {
        console.log(chalk.red('\n✗ Secrets detected. Failing...'));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('\n✓ No secrets detected'));
    }

  } catch (error) {
    spinner.fail(`Scan failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

async function discoverFiles(targetPath, options) {
  const files = [];
  const extensions = options.extensions || ['.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml', '.env'];

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext) || entry.name.startsWith('.env')) {
          const filePath = path.join(entry.parentPath || targetPath, entry.name);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            files.push({ path: filePath, content });
          } catch {
            // Skip binary or unreadable files
          }
        }
      }
    }
  } catch (error) {
    console.error('Error discovering files:', error.message);
  }

  return files;
}

function displaySecrets(secrets, options) {
  console.log('\n' + chalk.bold('═'.repeat(70)));
  console.log(chalk.bold('Detected Secrets'));
  console.log(chalk.bold('═'.repeat(70)));

  const groupedByType = secrets.reduce((acc, secret) => {
    acc[secret.type] = acc[secret.type] || [];
    acc[secret.type].push(secret);
    return acc;
  }, {});

  for (const [type, typeSecrets] of Object.entries(groupedByType)) {
    console.log(`\n${chalk.bold(type.toUpperCase())} (${typeSecrets.length})`);
    console.log(chalk.gray('─'.repeat(70)));

    typeSecrets.forEach((secret, idx) => {
      const severityColor = {
        critical: chalk.red,
        high: chalk.red,
        medium: chalk.yellow,
      }[secret.severity] || chalk.white;

      console.log(`\n${idx + 1}. ${severityColor(secret.severity.toUpperCase())}`);
      console.log(`   File: ${chalk.cyan(secret.file)}:${secret.line}`);
      console.log(`   Message: ${secret.message}`);

      if (secret.rawMatch) {
        console.log(`   Match: ${chalk.yellow(secret.rawMatch)}`);
      }

      if (secret.suggestion) {
        console.log(`   ${chalk.green('→')} ${secret.suggestion}`);
      }

      if (options.verbose && secret.snippet) {
        console.log(`\n   ${chalk.gray('Context:')}`);
        console.log(secret.snippet.split('\n').map(l => `   ${l}`).join('\n'));
      }
    });
  }

  console.log('\n' + chalk.yellow('⚠') + ' Review these secrets immediately and rotate if necessary.\n');
}

export async function addSecretPattern(name, pattern, options = {}) {
  const scanner = new SecretsScanner();

  scanner.addCustomPattern({
    name,
    pattern: new RegExp(pattern),
    severity: options.severity || 'high',
    message: options.message || `Custom secret pattern: ${name}`,
    remediation: options.remediation || 'Review and remove if necessary',
  });

  console.log(chalk.green(`✓ Added custom secret pattern: ${name}`));
}

export async function listSecretPatterns() {
  console.log(chalk.bold('\nSecret Detection Patterns\n'));

  const scanner = new SecretsScanner();
  const patterns = scanner.secretsDb;

  console.log(chalk.gray('Type'.padEnd(25) + 'Vendor'.padEnd(15) + 'Severity'));
  console.log(chalk.gray('─'.repeat(70)));

  for (const [type, config] of Object.entries(patterns)) {
    const severityColor = {
      critical: chalk.red,
      high: chalk.yellow,
      medium: chalk.blue,
    }[config.severity] || chalk.white;

    console.log(
      `${type.padEnd(25)} ${config.vendor.padEnd(15)} ${severityColor(config.severity)}`
    );
  }

  console.log();
}
