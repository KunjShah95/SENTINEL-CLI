export { EventBus, globalEventBus } from './events/eventBus.js';
export { EventType, AnalyzerPhase, HookType, LifecyclePhase, SeverityLevel, AnalyzerCategory, FileType } from '../interfaces/index.js';

import PluginManager from './plugins/pluginManager.js';
export { PluginManager };

import FeatureFlags from './features/featureFlags.js';
export { FeatureFlags };

import MetricsCollector, { globalMetrics } from './metrics/metricsCollector.js';
export { MetricsCollector, globalMetrics };

export { RetryPolicy, CircuitBreaker, Bulkhead } from './retry/resilience.js';

import AnalyzerRegistry from './analyzers/analyzerRegistry.js';
export { AnalyzerRegistry };

import { CacheManager, MemoryCacheAdapter, FileCacheAdapter } from './cache/cacheManager.js';
export { CacheManager, MemoryCacheAdapter, FileCacheAdapter };

import ParallelProcessor from './processing/parallelProcessor.js';
export { ParallelProcessor };

import FalsePositiveReducer from './ai/falsePositiveReducer.js';
export { FalsePositiveReducer };

import AnalysisOrchestrator from './analysisOrchestrator.js';
export { AnalysisOrchestrator };

import IncrementalAnalyzer from './analysis/incrementalAnalyzer.js';
export { IncrementalAnalyzer };

import DatabaseManager from './database/databaseManager.js';
export { DatabaseManager };

import {
  NotificationManager,
  SlackChannel,
  DiscordChannel,
  EmailChannel,
  ConsoleChannel,
} from './notifications/notificationManager.js';
export {
  NotificationManager,
  SlackChannel,
  DiscordChannel,
  EmailChannel,
  ConsoleChannel,
};

import AutoFixGenerator from './ai/autoFixGenerator.js';
export { AutoFixGenerator };

import PolicyEngine from './policy/policyEngine.js';
export { PolicyEngine };

import ReportGenerator from './reports/reportGenerator.js';
export { ReportGenerator };

import SentinelAPIServer from './api/apiServer.js';
export { SentinelAPIServer };

import PrometheusExporter from './metrics/prometheusExporter.js';
export { PrometheusExporter };

// Cache Adapters
import RedisCacheAdapter from './cache/redisCacheAdapter.js';
export { RedisCacheAdapter };

// Multi-tenant Support
import MultiTenantManager from './auth/multiTenantManager.js';
export { MultiTenantManager };

// Authentication
import AuthenticationManager from './auth/authenticationManager.js';
export { AuthenticationManager };

// Audit Logging
import AuditLogger from './audit/auditLogger.js';
export { AuditLogger };

// Rule Engine
import RuleEngine from './rules/ruleEngine.js';
export { RuleEngine };

// Webhooks
import WebhookManager from './webhooks/webhookManager.js';
export { WebhookManager };
