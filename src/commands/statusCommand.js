import chalk from 'chalk';
import { cache } from '../utils/sqliteCache.js';
import enhancedRateLimiter from '../utils/enhancedRateLimiter.js';
import Config from '../config/config.js';

export async function showStatus(options = {}) {
    console.log(chalk.cyan.bold('\n📊 Sentinel Status\n'));

    const config = new Config();
    await config.load();

    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('Configuration')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Enabled Analyzers: ${config.get('analysis.enabledAnalyzers')?.join(', ') || 'default'}`);
    console.log(`Output Format: ${config.get('output.format') || 'console'}`);
    console.log(`AI Enabled: ${config.get('ai.enabled') ? 'Yes' : 'No'}`);
    console.log(`Max File Size: ${((config.get('analysis.maxFileSize') || 1000000) / 1024).toFixed(0)} KB`);

    if (options.cache) {
        console.log('\n' + chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('Cache Statistics')}`);
        console.log(chalk.gray('─'.repeat(50)));

        const cacheStats = await cache.getStats();
        console.log(`Status: ${cacheStats.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
        console.log(`Memory Size: ${cacheStats.memorySize} / ${cacheStats.maxSize}`);
        console.log(`Hit Rate: ${cacheStats.hitRate}`);
        console.log(`Hits: ${cacheStats.hits} | Misses: ${cacheStats.misses}`);
        console.log(`Database Size: ${cacheStats.dbSize}`);
    }

    if (options.rateLimiter) {
        console.log('\n' + chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('Rate Limiter Status')}`);
        console.log(chalk.gray('─'.repeat(50)));

        const rateStats = enhancedRateLimiter.getStats();
        for (const [key, value] of Object.entries(rateStats)) {
            if (typeof value === 'object') {
                console.log(`${key}:`);
                for (const [k, v] of Object.entries(value)) {
                    console.log(`  ${k}: ${v}`);
                }
            } else {
                console.log(`${key}: ${value}`);
            }
        }
    }

    console.log('');
}

export default { showStatus };
