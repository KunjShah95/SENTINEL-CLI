import { CodeReviewBot } from '../bot.js';
import Config from '../config/config.js';

export async function runAnalyze(files, options = {}) {
    const config = new Config();
    await config.load();

    const bot = new CodeReviewBot();
    await bot.initialize();

    const result = await bot.runAnalysis({
        files,
        commit: options.commit,
        branch: options.branch,
        staged: options.staged,
        pr: options.pr,
        format: options.format || 'console',
        output: options.output,
        snippets: options.snippets,
        silent: options.silent
    });

    return result;
}

export async function getAnalysisStats() {
    const config = new Config();
    await config.load();

    const bot = new CodeReviewBot();
    await bot.initialize();
    const stats = await bot.showStats();

    return stats;
}

export default { runAnalyze, getAnalysisStats };
