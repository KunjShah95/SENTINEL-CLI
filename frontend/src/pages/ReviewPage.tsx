import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CohortTree } from '../components/CohortTree';
import { DiffViewer } from '../components/DiffViewer';
import { ReviewSummary } from '../components/ReviewSummary';

type ReviewData = {
  id: string;
  prUrl: string;
  prTitle: string;
  issues: Issue[];
  walkthrough: any;
  diagrams: any;
  changeStack: any;
  cohorts: Cohort[];
  qualityGates: any;
  metrics: any;
};

type Issue = {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  title?: string;
  suggestion?: string;
  tool?: string;
  category?: string;
};

type Cohort = {
  name: string;
  description: string;
  files: string[];
  fileCount: number;
};

const API_BASE = '/api/reviews';

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'walkthrough' | 'diagrams'>('issues');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API_BASE}/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Review not found');
        return r.json();
      })
      .then(data => {
        setReview(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const filteredIssues = review?.issues?.filter(issue => {
    if (severityFilter && issue.severity !== severityFilter) return false;
    if (selectedFile && issue.file !== selectedFile) return false;
    return true;
  }) || [];

  const severityCounts = review?.issues?.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-void)]">
        <div className="text-[var(--color-text-secondary)] animate-pulse text-lg">Loading review...</div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-void)]">
        <div className="text-red-400">{error || 'Review not found'}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] overflow-hidden">
      {/* Left Panel: Cohort Navigation */}
      <div className="w-64 border-r border-[var(--color-border)] flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Cohorts</h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {review.cohorts?.length || 0} groups
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CohortTree
            cohorts={review.cohorts || []}
            selectedCohort={selectedCohort}
            selectedFile={selectedFile}
            onCohortSelect={setSelectedCohort}
            onFileSelect={setSelectedFile}
          />
        </div>
        {/* Severity filter */}
        <div className="p-3 border-t border-[var(--color-border)]">
          <div className="flex gap-1 flex-wrap">
            {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                className={`px-2 py-0.5 text-xs rounded ${
                  severityFilter === sev ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {sev} ({severityCounts[sev] || 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center Panel: Diff Viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-3 border-b border-[var(--color-border)] flex items-center gap-3">
          <h1 className="text-sm font-semibold truncate flex-1">{review.prTitle || `Review #${review.id}`}</h1>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-red-900/30 text-red-300">{severityCounts.critical || 0} critical</span>
            <span className="px-2 py-0.5 rounded bg-orange-900/30 text-orange-300">{severityCounts.high || 0} high</span>
            <span className="px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-300">{severityCounts.medium || 0} medium</span>
            <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-300">{severityCounts.low || 0} low</span>
          </div>
        </div>

        {/* File + Diff */}
        <div className="flex-1 overflow-y-auto">
          <DiffViewer
            issues={filteredIssues}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />
        </div>
      </div>

      {/* Right Panel: Summary */}
      <div className="w-80 border-l border-[var(--color-border)] flex flex-col flex-shrink-0">
        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)]">
          {(['issues', 'walkthrough', 'diagrams'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize ${
                activeTab === tab
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'issues' && (
            <div className="space-y-2">
              {filteredIssues.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No issues found</p>
              ) : (
                filteredIssues.map((issue, i) => (
                  <div
                    key={i}
                    className="p-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)]"
                    onClick={() => { setSelectedFile(issue.file); }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={issue.severity} />
                      <span className="text-xs text-[var(--color-text-secondary)] truncate">{issue.file}:{issue.line}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-primary)]">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">{issue.suggestion}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'walkthrough' && (
            <ReviewSummary
              walkthrough={review.walkthrough}
              changeStack={review.changeStack}
              metrics={review.metrics}
            />
          )}

          {activeTab === 'diagrams' && (
            <div className="space-y-4">
              {review.diagrams ? (
                <>
                  {review.diagrams.sequence && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">API Flow</h3>
                      <pre className="text-xs bg-[var(--color-surface)] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                        {review.diagrams.sequence}
                      </pre>
                    </div>
                  )}
                  {review.diagrams.stateMachine && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">State Machine</h3>
                      <pre className="text-xs bg-[var(--color-surface)] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                        {review.diagrams.stateMachine}
                      </pre>
                    </div>
                  )}
                  {review.diagrams.erDiagram && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Data Model</h3>
                      <pre className="text-xs bg-[var(--color-surface)] p-2 rounded overflow-x-auto whitespace-pre-wrap">
                        {review.diagrams.erDiagram}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">No diagrams available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500',
    info: 'bg-blue-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[severity] || 'bg-gray-500'}`} />;
}
