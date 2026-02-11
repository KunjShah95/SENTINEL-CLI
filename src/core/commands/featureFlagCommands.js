import chalk from 'chalk';
import { FeatureFlags } from '../features/featureFlags.js';

export async function listFeatureFlags() {
  console.log(chalk.bold('\nFeature Flags\n'));

  const flags = new FeatureFlags();
  await flags.load();

  const allFlags = flags.getAllFlags();

  console.log(chalk.gray('Name'.padEnd(40) + 'Status'.padEnd(10) + 'Rollout'));
  console.log(chalk.gray('─'.repeat(70)));

  for (const [name, flag] of Object.entries(allFlags)) {
    const status = flag.isEnabled
      ? chalk.green('✓ Enabled')
      : chalk.red('✗ Disabled');

    const rollout = flag.rollout !== undefined
      ? `${flag.rollout}%`
      : 'N/A';

    console.log(`${name.padEnd(40)} ${status.padEnd(20)} ${rollout}`);

    if (flag.description) {
      console.log(chalk.gray(`  ${flag.description}`));
    }
  }

  console.log();
}

export async function enableFeatureFlag(featureName) {
  const flags = new FeatureFlags();
  await flags.load();

  flags.enableFeature(featureName);
  console.log(chalk.green(`✓ Enabled feature: ${featureName}`));
}

export async function disableFeatureFlag(featureName) {
  const flags = new FeatureFlags();
  await flags.load();

  flags.disableFeature(featureName);
  console.log(chalk.red(`✓ Disabled feature: ${featureName}`));
}

export async function setFeatureRollout(featureName, percentage) {
  const flags = new FeatureFlags();
  await flags.load();

  const pct = parseInt(percentage, 10);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    console.error(chalk.red('Error: Percentage must be between 0 and 100'));
    process.exit(1);
  }

  flags.setRollout(featureName, pct);
  console.log(chalk.blue(`✓ Set ${featureName} rollout to ${pct}%`));
}

export async function evaluateFeature(featureName, context = {}) {
  const flags = new FeatureFlags();
  await flags.load();

  const result = await flags.evaluateFeature(featureName, context);

  console.log(chalk.bold(`\nFeature: ${featureName}\n`));
  console.log(`Enabled: ${result.enabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`Reason: ${chalk.gray(result.reason)}`);

  if (result.rollout !== undefined) {
    console.log(`Rollout: ${result.rollout}%`);
  }
}
