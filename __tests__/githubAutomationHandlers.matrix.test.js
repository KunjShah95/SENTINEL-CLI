import {
  determineAutomationActions,
  classifyIssueForTriage,
  buildHandlerMatrixReport,
} from '../src/integrations/githubAutomationHandlers.js';

describe('GitHub automation handler matrix', () => {
  const scenarios = [
    {
      name: 'PR opened triggers review pipeline',
      event: { eventName: 'pull_request', action: 'opened', pull_request: { number: 42, title: 'Improve auth' } },
      expectedActions: ['run_pr_review', 'run_pr_relevance_check', 'run_related_issue_linker', 'run_pr_labeler'],
    },
    {
      name: 'PR synchronize triggers review pipeline',
      event: { eventName: 'pull_request', action: 'synchronize', pull_request: { number: 42, title: 'Improve auth' } },
      expectedActions: ['run_pr_review', 'run_pr_relevance_check', 'run_related_issue_linker', 'run_pr_labeler'],
    },
    {
      name: 'Issue opened triggers triage pipeline',
      event: { eventName: 'issues', action: 'opened', issue: { number: 11, title: 'Security vulnerability in parser' } },
      expectedActions: ['run_issue_triage', 'run_issue_duplicate_check', 'ensure_issue_labels_exist', 'suggest_issue_template_improvements'],
    },
    {
      name: 'Issue labeled triggers policy check',
      event: { eventName: 'issues', action: 'labeled', issue: { number: 11, title: 'Performance issue' } },
      expectedActions: ['run_issue_label_policy_check'],
    },
    {
      name: 'Issue comment with sentinel command routes command',
      event: { eventName: 'issue_comment', action: 'created', body: '/sentinel re-run latest analysis' },
      expectedActions: ['run_comment_command_router'],
    },
    {
      name: 'Issue comment without command does not route',
      event: { eventName: 'issue_comment', action: 'created', body: 'Looks good to me' },
      expectedActions: [],
    },
  ];

  test.each(scenarios)('$name', ({ event, expectedActions }) => {
    const result = determineAutomationActions(event);
    expect(result.actions).toEqual(expect.arrayContaining(expectedActions));

    if (expectedActions.length === 0) {
      expect(result.actions.length).toBe(0);
    }
  });

  test('issue triage classifier assigns security/performance/docs labels', () => {
    const labels = classifyIssueForTriage({
      title: 'Security vulnerability causes latency spike',
      body: 'Potential SQL injection and performance degradation. Please update docs too.',
    });

    expect(labels).toEqual(expect.arrayContaining([
      'needs-triage',
      'security',
      'bug',
      'performance',
      'documentation',
    ]));
  });

  test('matrix report summarizes pass/fail counts', () => {
    const report = buildHandlerMatrixReport([
      { name: 'A', passed: true },
      { name: 'B', passed: false },
      { name: 'C', passed: true },
    ]);

    expect(report.summary.totalScenarios).toBe(3);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.generatedAt).toBeTruthy();
  });
});
