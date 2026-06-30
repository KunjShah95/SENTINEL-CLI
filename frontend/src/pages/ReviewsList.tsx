import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type ReviewSummary = {
  id: string;
  prUrl: string;
  prTitle: string;
  createdAt: string;
  issueCount: number;
};

const API_BASE = '/api/reviews';

export function ReviewsList() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(API_BASE)
      .then(r => r.json())
      .then(data => {
        setReviews(data.reviews || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)]">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Review Dashboard</h1>
        <p className="text-[var(--color-text-secondary)] mb-8">Recent PR reviews from Sentinel's auto-review pipeline.</p>

        {loading ? (
          <div className="text-[var(--color-text-secondary)] animate-pulse">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🛡️</div>
            <h2 className="text-xl font-semibold mb-2">No reviews yet</h2>
            <p className="text-[var(--color-text-secondary)] mb-4">Reviews appear here automatically after the PR bot analyzes a pull request.</p>
            <a href="/docs" className="text-[var(--color-primary)] hover:underline text-sm">Learn how to set up the PR bot →</a>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(r => (
              <Link
                key={r.id}
                to={`/review/${encodeURIComponent(r.id)}`}
                className="block p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{r.prTitle || `Review ${r.id}`}</h3>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {r.prUrl ? <a href={r.prUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.prUrl}</a> : r.id}
                    </p>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-sm font-semibold">{r.issueCount} issue{r.issueCount !== 1 ? 's' : ''}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{new Date(r.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
