import AnalysisOrchestrator from '../../src/core/analysisOrchestrator.js';
import FalsePositiveReducer from '../../src/core/ai/falsePositiveReducer.js';
import PolicyEngine from '../../src/core/policy/policyEngine.js';

describe('AnalysisOrchestrator Pipeline', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new AnalysisOrchestrator();
  });

  describe('Pipeline Stages', () => {
    test('should generate unique runId', () => {
      const runId1 = orchestrator.generateRunId();
      const runId2 = orchestrator.generateRunId();
      
      expect(runId1).toBeTruthy();
      expect(runId2).toBeTruthy();
      expect(runId1).not.toBe(runId2);
    });

    test('should track stage metrics', () => {
      orchestrator.startStage('scan');
      orchestrator.completeStage('scan', { issueCount: 5 });

      expect(orchestrator.stageMetrics.scan).toBeDefined();
      expect(orchestrator.stageMetrics.scan.status).toBe('completed');
      expect(orchestrator.stageMetrics.scan.duration).toBeGreaterThan(0);
    });

    test('should return stage metrics in result', async () => {
      const mockFiles = [{ path: 'test.js', content: 'const x = 1;' }];
      
      const result = await orchestrator.analyze(mockFiles, {
        parallel: false,
        reduceFalsePositives: false,
      });

      expect(result.stageMetrics).toBeDefined();
      expect(result.runId).toBeDefined();
    });
  });

  describe('Tenant Context', () => {
    test('should set tenant context', () => {
      orchestrator.setTenantContext('tenant-123', 'team-456', 'repo-789');

      expect(orchestrator.tenantContext).toEqual({
        tenantId: 'tenant-123',
        teamId: 'team-456',
        repoId: 'repo-789',
        setAt: expect.any(String),
      });
    });

    test('should set policy profile', () => {
      orchestrator.setPolicyProfile('strict-ci');

      expect(orchestrator.policyProfile).toBe('strict-ci');
    });

    test('should set queue priority', () => {
      orchestrator.setQueuePriority('high');

      expect(orchestrator.queuePriority).toBe('high');
    });

    test('should reject invalid priority', () => {
      orchestrator.setQueuePriority('invalid');
      
      expect(orchestrator.queuePriority).toBe('normal');
    });

    test('should return execution metadata', () => {
      orchestrator.setTenantContext('tenant-1');
      orchestrator.setPolicyProfile('security');
      
      const metadata = orchestrator.getExecutionMetadata();

      expect(metadata.tenantContext).toBeDefined();
      expect(metadata.policyProfile).toBe('security');
    });
  });

  describe('Remediation Pipeline', () => {
    test('should support dry-run mode', async () => {
      const mockFiles = [{ path: 'test.js', content: 'const x = 1;' }];

      const result = await orchestrator.analyze(mockFiles, {
        parallel: false,
        dryRun: true,
      });

      expect(orchestrator.dryRunMode).toBe(true);
    });
  });
});

describe('FalsePositiveReducer Enhancements', () => {
  let reducer;

  beforeEach(() => {
    reducer = new FalsePositiveReducer();
  });

  describe('Tenant Isolation', () => {
    test('should set tenant context', () => {
      reducer.setTenantContext('tenant-1', 'team-a');

      expect(reducer.currentTenantId).toBe('tenant-1');
      expect(reducer.currentTeamId).toBe('team-a');
    });

    test('should create isolated learning data per tenant', () => {
      reducer.setTenantContext('tenant-1', 'team-a');
      reducer.setTenantContext('tenant-2', 'team-b');

      const key1 = reducer.getTenantKey('tenant-1', 'team-a');
      const key2 = reducer.getTenantKey('tenant-2', 'team-b');

      expect(key1).not.toBe(key2);
    });
  });

  describe('Confidence Drift', () => {
    test('should track confidence snapshots', () => {
      reducer.trackConfidenceSnapshot('security', 'sql-injection', 0.8);
      reducer.trackConfidenceSnapshot('security', 'sql-injection', 0.85);

      const history = reducer.confidenceHistory?.get('security:sql-injection');
      expect(history).toHaveLength(2);
    });

    test('should generate drift report', () => {
      for (let i = 0; i < 10; i++) {
        reducer.trackConfidenceSnapshot('security', 'xss', 0.5 + (i * 0.03));
      }

      const report = reducer.generateConfidenceDriftReport();

      expect(report.drifts).toBeDefined();
      expect(report.summary.totalRulesTracked).toBeGreaterThan(0);
    });

    test('should detect anomalous drift', () => {
      for (let i = 0; i < 5; i++) {
        reducer.trackConfidenceSnapshot('security', 'critical-issue', 0.3 - (i * 0.1));
      }

      const anomalies = reducer.detectAnomalousDrift(0.2);

      expect(anomalies).toBeDefined();
    });
  });

  describe('Approval Workflow', () => {
    test('should require approval for critical issues', () => {
      reducer.setApprovalRequirement('team-a', true);

      const issue = { severity: 'critical', type: 'sql-injection' };
      expect(reducer.requiresApproval(issue)).toBe(true);
    });

    test('should not require approval for non-critical issues', () => {
      reducer.setApprovalRequirement('team-a', true);

      const issue = { severity: 'low', type: 'console-log' };
      expect(reducer.requiresApproval(issue)).toBe(false);
    });

    test('should request approval', () => {
      const issue = { severity: 'critical', type: 'secret' };
      const result = reducer.requestApproval(issue, 'False positive in test environment');

      expect(result.approved).toBe(false);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Signed Baselines', () => {
    test('should export signed learning data', () => {
      reducer.setTenantContext('tenant-1');
      
      const exported = reducer.exportLearningData({ sign: true, secretKey: 'test-key' });

      expect(exported.signature).toBeDefined();
    });
  });
});

describe('PolicyEngine Enhancements', () => {
  let policyEngine;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
  });

  describe('Policy Bundles', () => {
    test('should create signed policy bundle', () => {
      const policy = policyEngine.createPolicyTemplate('test', 'security');
      policyEngine.policies.set(policy.id, policy);

      const bundle = policyEngine.createPolicyBundle([policy.id], { author: 'test' });

      expect(bundle.id).toBeDefined();
      expect(bundle.checksum).toBeDefined();
    });

    test('should sign and verify bundle', () => {
      const policy = policyEngine.createPolicyTemplate('test', 'security');
      policyEngine.policies.set(policy.id, policy);

      const bundle = policyEngine.createPolicyBundle([policy.id]);
      const signed = policyEngine.signBundle(bundle.id, 'secret-key');

      expect(signed.signature).toBeDefined();

      const isValid = policyEngine.verifyBundleSignature(bundle.id, 'secret-key');
      expect(isValid).toBe(true);
    });
  });

  describe('Policy Precedence', () => {
    test('should set policy precedence', () => {
      policyEngine.setPolicyPrecedence(['local', 'repo', 'org']);

      expect(policyEngine.policyPrecedence).toEqual(['local', 'repo', 'org']);
    });

    test('should organize policies by scope', () => {
      const policies = [
        { id: 'p1', scope: 'org' },
        { id: 'p2', scope: 'repo' },
        { id: 'p3', scope: 'local' },
      ];

      const organized = policyEngine.organizePoliciesByScope(policies);

      expect(organized.org).toHaveLength(1);
      expect(organized.repo).toHaveLength(1);
      expect(organized.local).toHaveLength(1);
    });
  });

  describe('Simulation Mode', () => {
    test('should enable simulation mode', () => {
      policyEngine.enableSimulationMode();

      expect(policyEngine.simulationMode).toBe(true);
    });

    test('should simulate policy changes', () => {
      policyEngine.enableSimulationMode();

      const issues = [
        { analyzer: 'security', type: 'secret', severity: 'critical' }
      ];

      const changes = [
        { action: 'add', policy: { id: 'new-policy', rules: [] } }
      ];

      const results = policyEngine.simulatePolicyChange(issues, changes);

      expect(results).toBeDefined();
    });

    test('should get simulation report', () => {
      policyEngine.enableSimulationMode();

      const issues = [{ analyzer: 'security' }];
      policyEngine.simulatePolicyChange(issues, []);

      const report = policyEngine.getSimulationReport();

      expect(report.scenarioCount).toBe(1);
    });
  });

  describe('Waivers', () => {
    test('should create waiver with expiry', () => {
      const issue = { id: 'issue-1', type: 'secret', analyzer: 'security', severity: 'high' };
      
      const waiver = policyEngine.createWaiver(issue, 'Intentionally using test secret', {
        expiresAt: '2025-12-31',
      });

      expect(waiver.id).toBeDefined();
      expect(waiver.expiresAt).toBe('2025-12-31');
    });

    test('should validate waiver', () => {
      const issue = { id: 'issue-1', type: 'secret' };
      const waiver = policyEngine.createWaiver(issue, 'Test', { autoApprove: true });

      const validation = policyEngine.validateWaiver(waiver.id);

      expect(validation.valid).toBe(true);
    });

    test('should check waiver for issue', () => {
      const issue = { id: 'issue-1', type: 'secret', file: 'config.js', line: 10 };
      const waiver = policyEngine.createWaiver(issue, 'Test', { autoApprove: true });

      const found = policyEngine.getWaiverForIssue(issue);

      expect(found).toBeDefined();
    });
  });
});
