import { promises as fs } from 'fs';
import path from 'path';
import { cache } from './sqliteCache.js';

class CacheWarmer {
    constructor() {
        this.warmed = new Set();
        this.stats = { warmed: 0, skipped: 0, errors: 0 };
    }

    async warmFromFiles(filePatterns = ['**/*.js', '**/*.ts', '**/*.py', '**/*.java']) {
        const { glob } = await import('glob');
        const maxFileSize = 500000;

        console.log('[CacheWarmer] Starting cache warming...');

        for (const pattern of filePatterns) {
            try {
                const files = await glob(pattern, { ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'] });

                for (const file of files) {
                    try {
                        const stat = await fs.stat(file);
                        if (stat.size > maxFileSize) {
                            this.stats.skipped++;
                            continue;
                        }

                        const content = await fs.readFile(file, 'utf8');
                        const key = cache.generateKey(file, content, 'warmup');

                        const existing = await cache.get(key);
                        if (!existing) {
                            await cache.set(key, { warmed: true, file, timestamp: Date.now() }, 'warmup', file);
                            this.stats.warmed++;
                        } else {
                            this.stats.skipped++;
                        }
                    } catch (e) {
                        this.stats.errors++;
                    }
                }
            } catch (e) {
                console.warn('[CacheWarmer] Pattern error:', e.message);
            }
        }

        console.log(`[CacheWarmer] Warming complete: ${this.stats.warmed} entries warmed, ${this.stats.skipped} skipped, ${this.stats.errors} errors`);
        return this.stats;
    }

    async warmFromGitChanges(baseBranch = 'main') {
        console.log('[CacheWarmer] Warming cache from git changes...');

        try {
            const { simplegit } = await import('simple-git');
            const git = simplegit();

            const diff = await git.diff([baseBranch, '--name-only']);
            const files = diff.split('\n').filter(f => f && !f.includes('/'));

            const maxFileSize = 500000;

            for (const file of files) {
                try {
                    const stat = await fs.stat(file);
                    if (stat.size > maxFileSize) continue;

                    const content = await fs.readFile(file, 'utf8');
                    const key = cache.generateKey(file, content, 'warmup');
                    await cache.set(key, { warmed: true, file, timestamp: Date.now() }, 'warmup', file);
                    this.stats.warmed++;
                } catch (e) {
                    this.stats.errors++;
                }
            }

            console.log(`[CacheWarmer] Git warming complete: ${this.stats.warmed} entries`);
            return this.stats;
        } catch (e) {
            console.warn('[CacheWarmer] Git warming failed:', e.message);
            return this.stats;
        }
    }

    async warmFromPackageJson() {
        console.log('[CacheWarmer] Checking package dependencies for known vulnerabilities...');

        try {
            const pkgPath = path.join(process.cwd(), 'package.json');
            const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

            const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
            const packages = Object.keys(dependencies);

            for (const pkgName of packages) {
                const version = dependencies[pkgName];
                const key = `dep:${pkgName}@${version}`;
                await cache.set(key, { package: pkgName, version, checked: Date.now() }, 'dependency');
                this.stats.warmed++;
            }

            console.log(`[CacheWarmer] Package warming complete: ${this.stats.warmed} entries`);
            return this.stats;
        } catch (e) {
            console.warn('[CacheWarmer] Package warming failed:', e.message);
            return this.stats;
        }
    }

    async warmAll() {
        const startTime = Date.now();

        await this.warmFromPackageJson();
        await this.warmFromFiles();
        await this.warmFromGitChanges();

        const duration = Date.now() - startTime;
        console.log(`[CacheWarmer] Full warming completed in ${duration}ms`);

        return { ...this.stats, duration };
    }

    getStats() {
        return cache.getStats();
    }
}

export const cacheWarmer = new CacheWarmer();
export default cacheWarmer;
