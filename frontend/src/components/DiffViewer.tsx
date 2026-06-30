import { useMemo } from 'react';

type Issue = {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  title?: string;
  suggestion?: string;
  tool?: string;
};

type Props = {
  issues: Issue[];
  selectedFile: string | null;
  onFileSelect: (file: string | null) => void;
};

const severityColors: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-950/20',
  high: 'border-l-orange-500 bg-orange-950/20',
  medium: 'border-l-yellow-500 bg-yellow-950/20',
  low: 'border-l-green-500 bg-green-950/20',
  info: 'border-l-blue-500 bg-blue-950/20',
};

const severityIcons: Record<string, string> = {
  critical: '🛑',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
  info: 'ℹ️',
};

export function DiffViewer({ issues, selectedFile, onFileSelect }: Props) {
  // Group issues by file
  const issuesByFile = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      const file = issue.file || 'unknown';
      if (!map.has(file)) map.set(file, []);
      map.get(file)!.push(issue);
    }
    return map;
  }, [issues]);

  const files = [...issuesByFile.keys()].sort();

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-[var(--color-text-secondary)] text-sm">No issues to display</p>
          <p className="text-[var(--color-text-secondary)] text-xs mt-1">
            {selectedFile ? 'Try clearing the file filter' : 'All clear!'}
          </p>
        </div>
      </div>
    );
  }

  // If a file is selected, show only that file's issues
  const displayFiles = selectedFile ? [selectedFile].filter(f => issuesByFile.has(f)) : files;

  return (
    <div className="p-4 space-y-4">
      {/* File tabs */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onFileSelect(null)}
          className={`px-2 py-1 text-[11px] rounded ${
            !selectedFile ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          All files ({issues.length})
        </button>
        {files.slice(0, 20).map(file => {
          const name = file.split('/').pop() || file;
          const count = issuesByFile.get(file)?.length || 0;
          return (
            <button
              key={file}
              onClick={() => onFileSelect(file === selectedFile ? null : file)}
              className={`px-2 py-1 text-[11px] rounded ${
                selectedFile === file ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
              title={file}
            >
              {name} ({count})
            </button>
          );
        })}
        {files.length > 20 && (
          <span className="px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">
            +{files.length - 20} more
          </span>
        )}
      </div>

      {/* Issues grouped by file */}
      {displayFiles.map(file => {
        const fileIssues = issuesByFile.get(file) || [];
        return (
          <div key={file} className="space-y-1">
            {/* File header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-t border border-[var(--color-border)]">
              <span className="text-xs font-mono text-[var(--color-text-primary)]">{file}</span>
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                {fileIssues.length} issue{fileIssues.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Issue list for this file */}
            <div className="border border-t-0 border-[var(--color-border)] rounded-b divide-y divide-[var(--color-border)]">
              {fileIssues
                .sort((a, b) => (a.line || 0) - (b.line || 0))
                .map((issue, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2 border-l-4 ${severityColors[issue.severity] || ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{severityIcons[issue.severity] || '⚠️'}</span>
                      <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                        Line {issue.line || '?'}
                      </span>
                      {issue.tool && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                          {issue.tool}
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--color-text-secondary)] uppercase">
                        {issue.severity}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-primary)]">{issue.message}</p>
                    {issue.title && issue.title !== issue.message && (
                      <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{issue.title}</p>
                    )}
                    {issue.suggestion && (
                      <div className="mt-1.5 p-2 bg-[var(--color-surface)] rounded text-[11px] text-[var(--color-text-secondary)]">
                        💡 {issue.suggestion}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
