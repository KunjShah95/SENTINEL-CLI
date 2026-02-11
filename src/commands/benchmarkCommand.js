import chalk from 'chalk';
import { cache } from '../utils/sqliteCache.js';
import { cacheWarmer } from '../utils/cacheWarmer.js';

export async function runBenchmark() {
    console.log(chalk.cyan.bold('\n⚡ Sentinel Performance Benchmark\n'));
    console.log(chalk.gray('─'.repeat(50)));

    const results = {};

    console.log('\n' + chalk.bold('1. Cache Performance'));
    console.log(chalk.gray('─'.repeat(30)));

    const testData = { test: 'benchmark', timestamp: Date.now(), data: 'x'.repeat(1000) };
    const testKey = 'benchmark:test:perf';

    const cacheStart = Date.now();
    await cache.set(testKey, testData, 'benchmark', 'test.js');
    const cacheWriteMs = Date.now() - cacheStart;

    const readStart = Date.now();
    const cachedValue = await cache.get(testKey);
    const cacheReadMs = Date.now() - readStart;

    console.log(`Cache Write: ${cacheWriteMs}ms`);
    console.log(`Cache Read: ${cacheReadMs}ms`);
    console.log(`Data Integrity: ${cachedValue ? chalk.green('✓') : chalk.red('✗')}`);

    results.cacheWrite = cacheWriteMs;
    results.cacheRead = cacheReadMs;

    console.log('\n' + chalk.bold('2. Cache Warming Performance'));
    console.log(chalk.gray('─'.repeat(30)));

    const warmerStart = Date.now();
    try {
        await cacheWarmer.warmFromFiles(['*.js', '*.json'].slice(0, 1));
        const warmerMs = Date.now() - warmerStart;
        console.log(`Cache Warming: ${warmerMs}ms`);
        results.warming = warmerMs;
    } catch (e) {
        console.log(`Cache Warming: ${chalk.yellow('Skipped - no files found')}`);
        results.warming = 0;
    }

    console.log('\n' + chalk.bold('3. SQLite Performance'));
    console.log(chalk.gray('─'.repeat(30)));

    const stats = await cache.getStats();
    console.log(`Database Size: ${stats.dbSize}`);
    console.log(`Memory Entries: ${stats.memorySize}`);
    console.log(`Hit Rate: ${stats.hitRate}`);

    console.log('\n' + chalk.cyan('─'.repeat(50)));
    console.log(chalk.bold.green('Benchmark Complete!'));
    console.log(chalk.cyan('─'.repeat(50)));

    console.log('\n' + chalk.bold('Summary:'));
    console.log(`  Cache Write: ${results.cacheWrite}ms`);
    console.log(`  Cache Read: ${results.cacheRead}ms`);
    if (results.warming) console.log(`  Cache Warming: ${results.warming}ms`);

    return results;
}

export async function runQuickTest() {
    console.log(chalk.cyan('\n🧪 Quick Functionality Test\n'));

    let passed = 0;
    let failed = 0;

    const tests = [
        {
            name: 'SQLite Cache',
            test: async () => {
                await cache.set('test:quick', { test: true }, 'quick', 'test.js');
                const result = await cache.get('test:quick');
                return result !== null;
            }
        },
        {
            name: 'Cache Stats',
            test: async () => {
                const stats = await cache.getStats();
                return typeof stats.hitRate === 'string' && stats.hitRate.includes('%');
            }
        },
        {
            name: 'Cache Invalidate',
            test: async () => {
                await cache.set('test:invalidate', { data: true }, 'inv', 'test.js');
                await cache.invalidate('test:invalidate');
                const result = await cache.get('test:invalidate');
                return result === null;
            }
        }
    ];

    for (const { name, test } of tests) {
        try {
            const result = await test();
            if (result) {
                console.log(`  ${chalk.green('✓')} ${name}`);
                passed++;
            } else {
                console.log(`  ${chalk.red('✗')} ${name}`);
                failed++;
            }
        } catch (e) {
            console.log(`  ${chalk.red('✗')} ${name} - ${e.message}`);
            failed++;
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

export default { runBenchmark, runQuickTest };
