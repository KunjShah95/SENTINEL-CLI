/**
 * Review UI API Routes
 *
 * Provides API endpoints for the web review dashboard:
 *   GET  /api/reviews/:id        — full review data
 *   GET  /api/reviews/:id/issues — issues for a review
 *   GET  /api/reviews            — list recent reviews
 */

import { Hono } from 'hono';

const reviewRoutes = new Hono();

// In-memory review store (replaced by DB in production)
const reviewStore = new Map();

/**
 * Register a review result so the UI can display it.
 * Called by the auto-review engine or CLI after analysis.
 */
export function registerReview(reviewId, data) {
  reviewStore.set(reviewId, {
    id: reviewId,
    createdAt: new Date().toISOString(),
    ...data,
  });
}

// GET /api/reviews — list recent reviews
reviewRoutes.get('/', (c) => {
  const reviews = [...reviewStore.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map(r => ({
      id: r.id,
      prUrl: r.prUrl,
      prTitle: r.prTitle,
      createdAt: r.createdAt,
      issueCount: r.issues?.length || 0,
      walkthrough: !!r.walkthrough,
    }));

  return c.json({ reviews });
});

// GET /api/reviews/:id — full review data
reviewRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const review = reviewStore.get(id);

  if (!review) {
    return c.json({ error: 'Review not found' }, 404);
  }

  return c.json({
    id: review.id,
    prUrl: review.prUrl,
    prTitle: review.prTitle,
    createdAt: review.createdAt,
    issues: review.issues || [],
    walkthrough: review.walkthrough || null,
    diagrams: review.diagrams || null,
    changeStack: review.changeStack || null,
    metrics: review.metrics || null,
    cohorts: review.cohorts || [],
    qualityGates: review.qualityGates || null,
    codePeek: review.codePeek || null,
    sastResults: review.sastResults || null,
  });
});

// GET /api/reviews/:id/issues — issues for a specific review
reviewRoutes.get('/:id/issues', (c) => {
  const id = c.req.param('id');
  const review = reviewStore.get(id);

  if (!review) {
    return c.json({ error: 'Review not found' }, 404);
  }

  const { severity, file, tool } = c.req.query();
  let issues = review.issues || [];

  // Filter by severity
  if (severity) {
    issues = issues.filter(i => i.severity === severity);
  }
  // Filter by file
  if (file) {
    issues = issues.filter(i => i.file === file);
  }
  // Filter by tool
  if (tool) {
    issues = issues.filter(i => i.tool === tool || i.analyzer === tool);
  }

  return c.json({
    issues,
    total: issues.length,
    bySeverity: {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
      info: issues.filter(i => i.severity === 'info').length,
    },
  });
});

// GET /api/reviews/:id/walkthrough — walkthrough data
reviewRoutes.get('/:id/walkthrough', (c) => {
  const id = c.req.param('id');
  const review = reviewStore.get(id);

  if (!review) {
    return c.json({ error: 'Review not found' }, 404);
  }

  return c.json({
    walkthrough: review.walkthrough || null,
    diagrams: review.diagrams || null,
    changeStack: review.changeStack || null,
    cohorts: review.cohorts || [],
  });
});

export default reviewRoutes;
