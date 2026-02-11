/**
 * Express server for badge API endpoints
 */
import express from 'express';
import { BadgeAPIServer } from './utils/badgeGenerator.js';
import { cache } from './utils/cache.js';
import { errorHandler } from './utils/errorHandler.js';

const app = express();
const PORT = process.env.BADGE_API_PORT || 3001;

const badgeServer = new BadgeAPIServer({ cache });

// CORS headers for badge serving
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
});

/**
 * GET /badge/:owner/:repo/:type.svg
 * Serve badge for repository
 */
app.get('/badge/:owner/:repo/:type.svg', async (req, res) => {
    try {
        const { owner, repo, type } = req.params;

        const result = await badgeServer.handleBadgeRequest(
            owner,
            repo,
            type.replace('.svg', '')
        );

        res.set('Content-Type', result.contentType);
        res.set('Cache-Control', result.cacheControl);
        res.send(result.svg);
    } catch (error) {
        await errorHandler.handle(error);
        res.status(500).send('Error generating badge');
    }
});

/**
 * GET /badge/:owner/:repo (default to score badge)
 */
app.get('/badge/:owner/:repo', async (req, res) => {
    res.redirect(`/badge/${req.params.owner}/${req.params.repo}/score.svg`);
});

/**
 * GET /api/badges/:owner/:repo
 * Get all badge markdown/HTML for a repository
 */
app.get('/api/badges/:owner/:repo', async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const generator = badgeServer.generator;

        const badges = generator.generateReadmeBadges(owner, repo);

        res.json({
            markdown: badges,
            html: {
                score: generator.generateHtmlBadge(owner, repo, 'score'),
                status: generator.generateHtmlBadge(owner, repo, 'status'),
                issues: generator.generateHtmlBadge(owner, repo, 'issues'),
                security: generator.generateHtmlBadge(owner, repo, 'security')
            }
        });
    } catch (error) {
        await errorHandler.handle(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'sentinel-badge-api' });
});

/**
 * Start server
 */
export function startBadgeServer() {
    app.listen(PORT, () => {
        console.log(`🎖️  Sentinel Badge API running on port ${PORT}`);
        console.log(`📊 Badge URL: http://localhost:${PORT}/badge/:owner/:repo/:type.svg`);
    });

    return app;
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startBadgeServer();
}

export default app;
