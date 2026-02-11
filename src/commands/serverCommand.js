import express from 'express';

export async function startBadgeServer(port = 3000) {
    const app = express();

    app.get('/badge/:owner/:repo/:type.svg', (req, res) => {
        const { type } = req.params;

        const colors = {
            passing: '#34A853',
            failing: '#EA4335',
            warning: '#FBBC05',
            unknown: '#9AA0A6'
        };

        const labels = {
            passing: 'Passing',
            failing: 'Failing',
            warning: 'Warning',
            unknown: 'Unknown'
        };

        const color = colors[type] || colors.unknown;
        const label = labels[type] || labels.unknown;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20">
          <rect width="60" height="20" fill="#555" rx="3"/>
          <rect x="60" width="40" height="20" fill="${color}" rx="3"/>
          <text x="30" y="14" fill="#fff" font-family="Arial" font-size="12" text-anchor="middle">Sentinel</text>
          <text x="80" y="14" fill="#fff" font-family="Arial" font-size="12" text-anchor="middle">${label}</text>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(svg);
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.log(`Badge server running at http://localhost:${port}`);
            resolve(server);
        });
    });
}

export default { startBadgeServer };
