export const AnalyzerPhase = {
  PRE_SCAN: 'pre-scan',
  SCAN: 'scan',
  POST_SCAN: 'post-scan',
  REPORT: 'report',
  FIX: 'fix',
};

export const HookType = {
  BEFORE_ANALYZE: 'beforeAnalyze',
  AFTER_ANALYZE: 'afterAnalyze',
  BEFORE_REPORT: 'beforeReport',
  AFTER_REPORT: 'afterReport',
  ON_ISSUE: 'onIssue',
  ON_ERROR: 'onError',
};

export const LifecyclePhase = {
  INITIALIZE: 'initialize',
  CONFIGURE: 'configure',
  ANALYZE: 'analyze',
  REPORT: 'report',
  CLEANUP: 'cleanup',
};

export const EventType = {
  ANALYZER_START: 'analyzer:start',
  ANALYZER_COMPLETE: 'analyzer:complete',
  ANALYZER_ERROR: 'analyzer:error',
  ISSUE_FOUND: 'issue:found',
  ISSUE_FIXED: 'issue:fixed',
  SCAN_START: 'scan:start',
  SCAN_COMPLETE: 'scan:complete',
  SCAN_PROGRESS: 'scan:progress',
  CONFIG_CHANGED: 'config:changed',
  PLUGIN_LOADED: 'plugin:loaded',
  PLUGIN_ERROR: 'plugin:error',
};

export const AnalyzerCategory = {
  SECURITY: 'security',
  QUALITY: 'quality',
  PERFORMANCE: 'performance',
  STYLE: 'style',
  DOCUMENTATION: 'documentation',
  ACCESSIBILITY: 'accessibility',
  CORRECTNESS: 'correctness',
  COMPLEXITY: 'complexity',
};

export const SeverityLevel = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

export const FileType = {
  SOURCE: 'source',
  TEST: 'test',
  CONFIG: 'config',
  DOCUMENTATION: 'documentation',
  BUILD: 'build',
};
