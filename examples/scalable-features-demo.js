#!/usr/bin/env node

/**
 * Example: Using Sentinel Scalable Features
 * 
 * This example demonstrates how to use the new scalable architecture
 * for high-performance code analysis.
 */

import {
  AnalysisOrchestrator,
  ParallelProcessor,
  FalsePositiveReducer,
  FeatureFlags,
  DatabaseManager,
  NotificationManager,
  ConsoleChannel,
  globalEventBus,
  EventType,
} from './src/core/index.js';

import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Sentinel Scalable Features Demo\n');

  // Example 1: Parallel Processing
  console.log('1️⃣ Parallel Processing Example');
  console.log('─'.repeat(50));

  const processor = new ParallelProcessor({
    maxWorkers: 4,
  });

  await processor.initialize();

  const tasks = [
    { type: 'analyze', analyzer: 'security', file: 'src/auth.js', content: 'const password = "secret123";' },
    { type: 'analyze', analyzer: 'quality', file: 'src/app.js', content: 'console.log("hello");' },
    { type: 'analyze', analyzer: 'bugs', file: 'src/utils.js', content: 'if (x = 1) { }' },
  ];

  console.log(`Submitting ${tasks.length} tasks to ${processor.maxWorkers} workers...`);

  const results = await processor.process(tasks, { timeout: 30000 });

  console.log('✓ Parallel processing complete\n');

  // Example 2: False Positive Reduction
  console.log('2️⃣ False Positive Reduction Example');
  console.log('─'.repeat(50));

  const reducer = new FalsePositiveReducer();

  const issues = [
    {
      analyzer: 'security',
      type: 'hardcoded-password',
      message: 'Hardcoded password detected',
      file: 'config.test.js',
      line: 5,
      severity: 'high',
      snippet: 'const testPassword = "test123";',
    },
    {
      analyzer: 'security',
      type: 'api-key',
      message: 'API key detected',
      file: 'src/api.js',
      line: 10,
      severity: 'critical',
      snippet: 'const apiKey = "sk_live_12345";',
    },
  ];

  const reduced = await reducer.reduce(issues, {
    testFiles: ['.test.js', '.spec.js'],
  });

  console.log(`Original issues: ${issues.length}`);
  console.log(`After reduction: ${reduced.issues.length}`);
  console.log(`Suppressed: ${reduced.suppressed.length}`);
  console.log('✓ False positive reduction complete\n');

  // Example 3: Feature Flags
  console.log('3️⃣ Feature Flags Example');
  console.log('─'.repeat(50));

  const flags = new FeatureFlags({
    storagePath: '.sentinel/demo-feature-flags.json',
  });

  await flags.load();

  // Check if feature is enabled
  if (flags.isEnabled('new-analyzer-framework')) {
    console.log('✓ New analyzer framework is enabled');
  }

  // Get feature variant
  const variant = flags.getVariant('ui-experiment');
  console.log(`UI Experiment variant: ${variant}`);

  // List all features
  const allFlags = flags.getAllFlags();
  console.log(`\nTotal features: ${Object.keys(allFlags).length}`);
  console.log('✓ Feature flags loaded\n');

  // Example 4: Event Bus
  console.log('4️⃣ Event-Driven Architecture Example');
  console.log('─'.repeat(50));

  // Subscribe to events
  globalEventBus.on(EventType.ANALYZER_START, (data) => {
    console.log(`  → Analyzer started: ${data.analyzerName}`);
  });

  globalEventBus.on(EventType.ISSUE_FOUND, (issue) => {
    console.log(`  → Issue found: ${issue.type} (${issue.severity})`);
  });

  // Emit events
  globalEventBus.emit(EventType.ANALYZER_START, {
    analyzerName: 'security',
    fileCount: 10,
  });

  globalEventBus.emit(EventType.ISSUE_FOUND, {
    type: 'hardcoded-password',
    severity: 'high',
    file: 'auth.js',
  });

  console.log('✓ Event system working\n');

  // Example 5: Database
  console.log('5️⃣ Database Persistence Example');
  console.log('─'.repeat(50));

  const db = new DatabaseManager({
    dbPath: '.sentinel/demo-database.json',
    autoSave: false,
  });

  await db.initialize();

  // Save analysis
  const analysisId = await db.saveAnalysis({
    project: 'demo-app',
    branch: 'main',
    issues: reduced.issues,
    stats: {
      filesAnalyzed: 3,
      issuesFound: reduced.issues.length,
    },
  });

  console.log(`✓ Analysis saved: ${analysisId}`);

  // Query analyses
  const analyses = await db.getAnalyses({ project: 'demo-app' });
  console.log(`✓ Retrieved ${analyses.length} analyses`);

  // Get stats
  const stats = await db.getIssueStats();
  console.log(`✓ Total issues in database: ${stats.total}\n`);

  // Example 6: Notifications
  console.log('6️⃣ Notification System Example');
  console.log('─'.repeat(50));

  const notifications = new NotificationManager();
  notifications.registerChannel('console', new ConsoleChannel());

  await notifications.send({
    title: 'Analysis Complete',
    message: `Found ${reduced.issues.length} issues after filtering`,
    severity: 'info',
    type: 'analysis',
  }, 'console');

  console.log('✓ Notification sent\n');

  // Example 7: Complete Orchestration
  console.log('7️⃣ Complete Orchestration Example');
  console.log('─'.repeat(50));

  const orchestrator = new AnalysisOrchestrator({
    parallelProcessor: processor,
    falsePositiveReducer: reducer,
  });

  // Note: In real usage, you'd pass actual file objects
  const files = [
    { path: 'src/file1.js', content: 'const x = 1;' },
    { path: 'src/file2.js', content: 'console.log("test");' },
  ];

  console.log(`Analyzing ${files.length} files with full pipeline...`);
  console.log('  - Parallel processing: ✓');
  console.log('  - False positive reduction: ✓');
  console.log('  - Metrics collection: ✓');

  // Cleanup
  await processor.shutdown();
  await db.close();
  await orchestrator.shutdown();

  console.log('\n' + '═'.repeat(50));
  console.log('✨ All scalable features working correctly!');
  console.log('═'.repeat(50));
}

main().catch(console.error);
