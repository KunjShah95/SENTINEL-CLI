const DEFAULT_TRIAGE_LABELS = [
  'needs-triage',
  'security',
  'bug',
  'enhancement',
  'documentation',
  'performance',
  'good first issue',
  'sentinel-finding',
  'critical',
  'automated',
  'analyzer-request',
];

export function normalizeGitHubEvent(event = {}) {
  return {
    eventName: event.eventName || event.name || '',
    action: event.action || '',
    number: event.number || event.issue?.number || event.pull_request?.number || null,
    labels: event.labels || event.issue?.labels || event.pull_request?.labels || [],
    title: event.title || event.issue?.title || event.pull_request?.title || '',
    body: event.body || event.issue?.body || event.pull_request?.body || '',
    sender: event.sender?.login || event.actor || '',
  };
}

export function determineAutomationActions(rawEvent = {}, options = {}) {
  const event = normalizeGitHubEvent(rawEvent);
  const actions = [];
  const triageLabels = options.triageLabels || DEFAULT_TRIAGE_LABELS;

  if (event.eventName === 'pull_request') {
    if (['opened', 'synchronize', 'reopened'].includes(event.action)) {
      actions.push('run_pr_review');
      actions.push('run_pr_relevance_check');
      actions.push('run_related_issue_linker');
    }

    if (['opened', 'edited', 'synchronize', 'reopened'].includes(event.action)) {
      actions.push('run_pr_labeler');
    }

    if (['closed'].includes(event.action)) {
      actions.push('finalize_pr_artifacts');
    }
  }

  if (event.eventName === 'issues') {
    if (['opened', 'edited', 'reopened'].includes(event.action)) {
      actions.push('run_issue_triage');
      actions.push('run_issue_duplicate_check');
    }

    if (event.action === 'opened') {
      actions.push('ensure_issue_labels_exist');
      actions.push('suggest_issue_template_improvements');
    }

    if (event.action === 'labeled') {
      actions.push('run_issue_label_policy_check');
    }
  }

  if (event.eventName === 'issue_comment' && event.action === 'created') {
    const body = String(event.body || '').toLowerCase();
    if (body.includes('/sentinel') || body.includes('sentinel')) {
      actions.push('run_comment_command_router');
    }
  }

  const uniqueActions = [...new Set(actions)];

  return {
    event,
    actions: uniqueActions,
    metadata: {
      triageLabelCount: triageLabels.length,
      defaultTriageLabels: triageLabels,
    },
  };
}

export function classifyIssueForTriage(issue = {}) {
  const title = String(issue.title || '').toLowerCase();
  const body = String(issue.body || '').toLowerCase();
  const text = `${title}\n${body}`;
  const labels = new Set(['needs-triage']);

  if (/security|vulnerability|xss|sql injection|cve|auth bypass|rce/.test(text)) {
    labels.add('security');
    labels.add('bug');
  }

  if (/performance|latency|slow|memory leak|throughput|cpu/.test(text)) {
    labels.add('performance');
  }

  if (/docs|documentation|readme|guide|typo/.test(text)) {
    labels.add('documentation');
  }

  if (/feature|enhancement|improve|proposal|request/.test(text)) {
    labels.add('enhancement');
  }

  if (/analyzer|rule|false positive|false-negative|scanner/.test(text)) {
    labels.add('analyzer-request');
  }

  return Array.from(labels);
}

export function buildHandlerMatrixReport(results = []) {
  const summary = {
    totalScenarios: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };
}

export default {
  normalizeGitHubEvent,
  determineAutomationActions,
  classifyIssueForTriage,
  buildHandlerMatrixReport,
};
