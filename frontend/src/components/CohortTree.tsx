import { useState } from 'react';

type Cohort = {
  name: string;
  description: string;
  files: string[];
  fileCount: number;
};

type Props = {
  cohorts: Cohort[];
  selectedCohort: string | null;
  selectedFile: string | null;
  onCohortSelect: (name: string | null) => void;
  onFileSelect: (file: string | null) => void;
};

export function CohortTree({ cohorts, selectedCohort, selectedFile, onCohortSelect, onFileSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (cohorts.length === 0) {
    return (
      <div className="p-3">
        <p className="text-xs text-[var(--color-text-secondary)]">No cohorts available</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {cohorts.map(cohort => (
        <div key={cohort.name}>
          {/* Cohort header */}
          <button
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-hover)] transition-colors ${
              selectedCohort === cohort.name ? 'bg-[var(--color-surface)] text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              toggleExpanded(cohort.name);
              onCohortSelect(selectedCohort === cohort.name ? null : cohort.name);
            }}
          >
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {expanded.has(cohort.name) ? '▼' : '▶'}
            </span>
            <span className="font-medium truncate flex-1">{cohort.name}</span>
            <span className="text-[10px] text-[var(--color-text-secondary)]">{cohort.fileCount}</span>
          </button>

          {/* Files in cohort */}
          {expanded.has(cohort.name) && (
            <div className="ml-4">
              {cohort.files.map(file => {
                const name = file.split('/').pop() || file;
                const dir = file.includes('/') ? file.split('/').slice(0, -1).join('/') : '';
                return (
                  <button
                    key={file}
                    className={`w-full flex items-center gap-2 px-3 py-1 text-left text-[11px] hover:bg-[var(--color-surface-hover)] transition-colors ${
                      selectedFile === file ? 'bg-[var(--color-surface)] text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'
                    }`}
                    onClick={() => onFileSelect(selectedFile === file ? null : file)}
                  >
                    <span className="truncate" title={file}>{name}</span>
                    {dir && <span className="text-[9px] text-[var(--color-text-secondary)] truncate ml-auto">{dir}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
