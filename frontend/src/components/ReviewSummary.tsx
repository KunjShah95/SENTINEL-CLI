type Props = {
  walkthrough: any;
  changeStack: any;
  metrics: any;
};

export function ReviewSummary({ walkthrough, changeStack, metrics }: Props) {
  if (!walkthrough && !changeStack && !metrics) {
    return (
      <div className="text-sm text-[var(--color-text-secondary)]">
        No walkthrough data available for this review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Walkthrough summary */}
      {walkthrough && (
        <div>
          <h3 className="text-sm font-semibold mb-2">PR Walkthrough</h3>
          {typeof walkthrough.summary === 'string' && (
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">{walkthrough.summary}</p>
          )}
          {walkthrough.effort && (
            <div className="flex gap-2 mb-3">
              <span className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                Effort: {walkthrough.effort.level}
              </span>
              <span className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                ~{walkthrough.effort.estimatedMinutes}min
              </span>
              <span className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
                {walkthrough.totalFiles} files
              </span>
            </div>
          )}
          {walkthrough.totalInsertions !== undefined && (
            <div className="flex gap-2 text-[10px]">
              <span className="text-green-400">+{walkthrough.totalInsertions}</span>
              <span className="text-red-400">-{walkthrough.totalDeletions}</span>
            </div>
          )}
        </div>
      )}

      {/* Cohorts from walkthrough */}
      {walkthrough?.cohorts && walkthrough.cohorts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Change Cohorts</h3>
          <div className="space-y-1">
            {walkthrough.cohorts.map((cohort: any) => (
              <details key={cohort.name} className="bg-[var(--color-surface)] rounded border border-[var(--color-border)]">
                <summary className="px-2 py-1.5 text-xs cursor-pointer hover:bg-[var(--color-surface-hover)]">
                  <span className="font-medium">{cohort.name}</span>
                  <span className="text-[var(--color-text-secondary)] ml-2">
                    ({cohort.fileCount} files, +{cohort.insertions}/-{cohort.deletions})
                  </span>
                </summary>
                <div className="px-2 pb-2">
                  {cohort.files?.slice(0, 10).map((file: any) => (
                    <div key={file.path} className="text-[11px] text-[var(--color-text-secondary)] py-0.5 font-mono">
                      {file.path}
                      <span className="text-green-400 ml-2">+{file.additions || 0}</span>
                      <span className="text-red-400 ml-1">-{file.deletions || 0}</span>
                    </div>
                  ))}
                  {cohort.files?.length > 10 && (
                    <div className="text-[10px] text-[var(--color-text-secondary)]">
                      +{cohort.files.length - 10} more files
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Change stack */}
      {changeStack && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Recommended Review Order</h3>
          {changeStack.recommendedOrder?.map((step: any) => (
            <div key={step.step} className="flex gap-2 py-1.5 border-b border-[var(--color-border)] last:border-0">
              <span className="w-5 h-5 flex items-center justify-center text-[10px] rounded-full bg-[var(--color-primary)] text-white flex-shrink-0">
                {step.step}
              </span>
              <div>
                <p className="text-xs font-medium">{step.name}</p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">{step.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {metrics.duration && (
              <div className="bg-[var(--color-surface)] p-2 rounded">
                <p className="text-[10px] text-[var(--color-text-secondary)]">Duration</p>
                <p className="text-xs font-medium">{metrics.duration}ms</p>
              </div>
            )}
            {metrics.toolsRun && (
              <div className="bg-[var(--color-surface)] p-2 rounded">
                <p className="text-[10px] text-[var(--color-text-secondary)]">SAST Tools</p>
                <p className="text-xs font-medium">{metrics.toolsRun.length}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
