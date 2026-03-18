import {
  tokenizeForSimilarity,
  jaccardSimilarity,
  computeDuplicateConfidence,
  computeRelatedIssueConfidence,
  computeSecurityScore,
  computeScoreDelta,
  detectPRChangeTypeLabels,
  buildScoreHistoryEntry,
  rankDuplicatePullRequests,
  rankRelatedIssues,
  buildFindingKey,
  parseIssueFindingKey,
} from '../src/utils/prIntelligence.js';

describe('prIntelligence scoring logic', () => {
  test('tokenizeForSimilarity removes stopwords and short words', () => {
    const tokens = tokenizeForSimilarity('Fix the auth bug in API');

    expect(tokens).toContain('auth');
    expect(tokens).toContain('bug');
    expect(tokens).toContain('api');
    expect(tokens).not.toContain('the');
  });

  test('jaccardSimilarity returns 0 for disjoint sets', () => {
    const sim = jaccardSimilarity(['auth', 'token'], ['docker', 'image']);
    expect(sim).toBe(0);
  });

  test('computeDuplicateConfidence favors similar title and files', () => {
    const high = computeDuplicateConfidence({
      prTitle: 'Add JWT auth middleware to API routes',
      prBody: 'Implements JWT validation for protected endpoints',
      candidateTitle: 'JWT auth middleware for protected routes',
      candidateBody: 'Add token validation to API endpoints',
      currentFiles: ['src/api/auth.js', 'src/api/routes.js'],
      candidateFiles: ['src/api/auth.js', 'src/api/routes.js'],
    });

    const low = computeDuplicateConfidence({
      prTitle: 'Add JWT auth middleware to API routes',
      prBody: 'Implements JWT validation for protected endpoints',
      candidateTitle: 'Fix typo in docs',
      candidateBody: 'README cleanup',
      currentFiles: ['src/api/auth.js', 'src/api/routes.js'],
      candidateFiles: ['README.md'],
    });

    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(0.3);
  });

  test('computeRelatedIssueConfidence provides higher confidence for matching issue', () => {
    const matching = computeRelatedIssueConfidence({
      prTitle: 'Prevent SQL injection in user search',
      prBody: 'Use parameterized queries in repository layer',
      changedFiles: ['src/repository/userRepo.js'],
      issueTitle: 'SQL injection vulnerability in user search',
      issueBody: 'Current query concatenates user input',
    });

    const unrelated = computeRelatedIssueConfidence({
      prTitle: 'Prevent SQL injection in user search',
      prBody: 'Use parameterized queries in repository layer',
      changedFiles: ['src/repository/userRepo.js'],
      issueTitle: 'Dark mode toggle not aligned',
      issueBody: 'Navbar button style issue',
    });

    expect(matching).toBeGreaterThan(unrelated);
  });

  test('computeSecurityScore penalizes severity correctly', () => {
    const issues = [
      { severity: 'critical' },
      { severity: 'high' },
      { severity: 'medium' },
      { severity: 'low' },
    ];

    const score = computeSecurityScore(issues);
    expect(score).toBe(46); // 100 - (40 + 10 + 3 + 1)
  });

  test('computeScoreDelta reports trend', () => {
    const delta = computeScoreDelta({
      baseIssues: [{ severity: 'critical' }, { severity: 'high' }],
      headIssues: [{ severity: 'medium' }],
    });

    expect(delta.baseScore).toBe(50);
    expect(delta.headScore).toBe(97);
    expect(delta.delta).toBe(47);
    expect(delta.trend).toBe('improved');
  });

  test('detectPRChangeTypeLabels infers labels from files and findings', () => {
    const labels = detectPRChangeTypeLabels({
      prTitle: 'feat!: improve auth perf and harden API',
      prBody: 'breaking change: auth middleware updated',
      files: ['src/api/auth.js', '.github/workflows/pr-review.yml'],
      issues: [{ severity: 'high', type: 'SecurityRisk', message: 'Potential SQL injection' }],
    });

    expect(labels).toContain('security-fix');
    expect(labels).toContain('performance');
    expect(labels).toContain('breaking-change');
    expect(labels).toContain('ci-cd');
  });

  test('buildScoreHistoryEntry returns normalized shape', () => {
    const item = buildScoreHistoryEntry({
      pullRequestNumber: 12,
      runId: 'run-1',
      sha: 'abc123',
      baseScore: 72,
      headScore: 90,
      delta: 18,
      trend: 'improved',
      timestamp: '2026-03-13T00:00:00.000Z',
    });

    expect(item).toEqual({
      pullRequestNumber: 12,
      runId: 'run-1',
      sha: 'abc123',
      baseScore: 72,
      headScore: 90,
      delta: 18,
      trend: 'improved',
      timestamp: '2026-03-13T00:00:00.000Z',
    });
  });

  test('rankDuplicatePullRequests returns sorted high-confidence candidates', () => {
    const ranked = rankDuplicatePullRequests({
      prTitle: 'Add JWT auth middleware to API routes',
      prBody: 'Implements JWT validation for protected endpoints',
      currentFiles: ['src/api/auth.js', 'src/api/routes.js'],
      candidates: [
        {
          number: 1,
          title: 'Fix typo in docs',
          body: 'README cleanup',
          files: ['README.md'],
        },
        {
          number: 2,
          title: 'JWT auth middleware for protected routes',
          body: 'Add token validation to API endpoints',
          files: ['src/api/auth.js', 'src/api/routes.js'],
        },
      ],
      threshold: 0.1,
    });

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].number).toBe(2);
    if (ranked.length > 1) {
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    }
  });

  test('rankRelatedIssues returns top matching issues', () => {
    const ranked = rankRelatedIssues({
      prTitle: 'Prevent SQL injection in user search',
      prBody: 'Use parameterized queries in repository layer',
      changedFiles: ['src/repository/userRepo.js'],
      issues: [
        {
          number: 10,
          title: 'Navbar spacing issue',
          body: 'UI alignment problem',
          url: 'https://example.com/10',
        },
        {
          number: 11,
          title: 'SQL injection vulnerability in user search',
          body: 'Current query concatenates user input',
          url: 'https://example.com/11',
        },
      ],
      threshold: 0.05,
    });

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].number).toBe(11);
  });

  test('buildFindingKey and parseIssueFindingKey are consistent', () => {
    const key = buildFindingKey('SQL Injection', 'src/api/auth.js');
    expect(key).toBe('sql injection::src/api/auth.js');

    const parsed = parseIssueFindingKey('**Type:** SQL Injection\n**File:** `src/api/auth.js`');
    expect(parsed).toBe(key);
  });
});
