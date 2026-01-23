/**
 * Enhanced AI Analyzer with Context-Aware Diff Analysis
 * Provides intelligent, adaptive LLM prompt tuning for security and quality analysis
 */

import BaseAnalyzer from '../analyzers/baseAnalyzer.js';
import { SeverityScorer } from '../utils/severityScorer.js';

export class EnhancedAIAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('EnhancedAIAnalyzer', config);
    this.severityScorer = new SeverityScorer();
    this.diffAnalyzer = new ContextAwareDiffAnalyzer();
    this.promptTuner = new AdaptivePromptTuner();
  }

  async analyze(files, context) {
    this.reset();
    const startTime = Date.now();

    for (const file of files) {
      if (!this.shouldAnalyzeFile(file.path)) continue;

      this.stats.filesAnalyzed++;
      this.stats.linesAnalyzed += file.content.split('\n').length;

      // Enhanced analysis based on context
      const analysisContext = await this.analyzeFileContext(file, context);
      
      // Run adaptive AI analysis
      const aiIssues = await this.runEnhancedAIAnalysis(file, analysisContext);
      
      // Add issues to the analyzer
      for (const issue of aiIssues) {
        this.addIssue(issue);
      }
    }

    this.stats.executionTime = Date.now() - startTime;
    return this.getIssues();
  }

  /**
   * Analyze file context to determine analysis strategy
   */
  async analyzeFileContext(file, context) {
    const fileInfo = {
      path: file.path,
      type: this.getFileType(file.path),
      size: file.content.length,
      lines: file.content.split('\n').length,
      isStaged: context.staged || false,
      isCommit: context.commit || false,
      isBranch: context.branch || false,
      language: this.detectLanguage(file.path),
      complexity: this.calculateComplexity(file.content),
      riskFactors: this.identifyRiskFactors(file)
    };

    // Determine analysis depth based on context
    if (context.staged) {
      fileInfo.analysisDepth = 'diff-focused'; // Focus on changes only
      fileInfo.priority = 'high';
    } else if (context.commit) {
      fileInfo.analysisDepth = 'commit-focused'; // Analyze full file for commit
      fileInfo.priority = 'medium';
    } else {
      fileInfo.analysisDepth = 'comprehensive'; // Full analysis
      fileInfo.priority = 'normal';
    }

    return fileInfo;
  }

  /**
   * Run enhanced AI analysis with adaptive prompting
   */
  async runEnhancedAIAnalysis(file, context) {
    const issues = [];

    try {
      // Get AI providers from config
      const aiConfig = this.config.get('ai');
      if (!aiConfig || !aiConfig.enabled || !aiConfig.providers) {
        return issues;
      }

      // Build adaptive prompt based on context
      const prompt = await this.promptTuner.buildAdaptivePrompt(file, context);
      
      // Execute analysis with multiple providers if configured
      const results = await this.executeMultiProviderAnalysis(prompt, aiConfig.providers);

      // Process and enhance results
      for (const result of results) {
        const enhancedIssues = await this.processAIResult(result, file, context);
        issues.push(...enhancedIssues);
      }

      // Apply severity scoring and prioritization
      return this.applySeverityScoring(issues);

    } catch (error) {
      console.warn(`Enhanced AI analysis failed for ${file.path}:`, error.message);
      return issues;
    }
  }

  /**
   * Execute analysis with multiple AI providers
   */
  async executeMultiProviderAnalysis(prompt, providers) {
    const results = [];
    const enabledProviders = providers.filter(p => p.enabled);
    
    if (enabledProviders.length === 0) {
      return results;
    }

    // Execute analysis in parallel for better performance
    const analysisPromises = enabledProviders.map(async (provider) => {
      try {
        return await this.executeProviderAnalysis(provider, prompt);
      } catch (error) {
        console.warn(`AI provider ${provider.id} failed:`, error.message);
        return null;
      }
    });

    const providerResults = await Promise.allSettled(analysisPromises);
    
    for (const result of providerResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    return results;
  }

  /**
   * Execute analysis with specific AI provider
   */
  async executeProviderAnalysis(provider, _prompt) {
    // This would integrate with the existing LLM orchestrator
    // For now, return a structured result that matches expected format
    
    return {
      provider: provider.id,
      model: provider.model,
      success: true,
      issues: [], // Would be populated by actual AI analysis
      confidence: 0.8,
      metadata: {
        tokensUsed: 0,
        analysisTime: Date.now()
      }
    };
  }

  /**
   * Process AI analysis result and enhance with context
   */
  async processAIResult(result, file, context) {
    const issues = [];
    
    if (!result.success || !result.issues) {
      return issues;
    }

    for (const rawIssue of result.issues) {
      // Enhance issue with context and metadata
      const enhancedIssue = {
        ...rawIssue,
        file: file.path,
        analyzer: 'EnhancedAIAnalyzer',
        confidence: result.confidence || 0.7,
        aiProvider: result.provider,
        model: result.model,
        context: {
          analysisDepth: context.analysisDepth,
          priority: context.priority,
          riskFactors: context.riskFactors,
          complexity: context.complexity
        },
        tags: [
          ...(rawIssue.tags || []),
          'ai-enhanced',
          context.language,
          context.analysisDepth
        ]
      };

      // Add contextual severity adjustment
      enhancedIssue.severity = this.adjustSeverityByContext(
        enhancedIssue.severity, 
        context
      );

      issues.push(enhancedIssue);
    }

    return issues;
  }

  /**
   * Apply comprehensive severity scoring
   */
  applySeverityScoring(issues) {
    return issues.map(issue => {
      const riskScore = this.severityScorer.calculateRiskScore(issue);
      return {
        ...issue,
        riskScore,
        priority: riskScore.priority,
        confidence: riskScore.confidence
      };
    });
  }

  /**
   * Adjust severity based on contextual factors
   */
  adjustSeverityByContext(baseSeverity, context) {
    let severity = baseSeverity;
    
    // Escalate severity for staged changes (pre-commit focus)
    if (context.isStaged && context.analysisDepth === 'diff-focused') {
      const escalationMap = {
        'low': 'medium',
        'medium': 'high',
        'high': 'critical'
      };
      severity = escalationMap[severity] || severity;
    }
    
    // Adjust for high-risk file types
    if (context.riskFactors.includes('authentication') || 
        context.riskFactors.includes('payment')) {
      const escalationMap = {
        'low': 'medium',
        'medium': 'high'
      };
      severity = escalationMap[severity] || severity;
    }
    
    // Adjust for high complexity files
    if (context.complexity > 8) {
      const escalationMap = {
        'info': 'low',
        'low': 'medium'
      };
      severity = escalationMap[severity] || severity;
    }
    
    return severity;
  }

  /**
   * Get file type classification
   */
  getFileType(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const name = filePath.toLowerCase();
    
    // Security-critical files
    if (name.includes('auth') || name.includes('login') || name.includes('jwt')) {
      return 'authentication';
    }
    
    if (name.includes('config') || name.includes('.env')) {
      return 'configuration';
    }
    
    if (name.includes('payment') || name.includes('billing')) {
      return 'payment';
    }
    
    if (name.includes('database') || name.includes('db')) {
      return 'database';
    }
    
    if (name.includes('api') || name.includes('endpoint')) {
      return 'api';
    }
    
    // Language-based classification
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'php': 'php',
      'go': 'go',
      'rs': 'rust',
      'cs': 'csharp'
    };
    
    return languageMap[ext] || 'unknown';
  }

  /**
   * Detect programming language
   */
  detectLanguage(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'react',
      'tsx': 'react',
      'py': 'python',
      'java': 'java',
      'php': 'php',
      'go': 'go',
      'rs': 'rust',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala'
    };
    
    return languageMap[ext] || 'unknown';
  }

  /**
   * Calculate code complexity score
   */
  calculateComplexity(content) {
    const lines = content.split('\n');
    let complexity = 0;
    
    // Simple complexity metrics
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Control structures
      if (/\b(if|for|while|switch|catch)\b/.test(trimmed)) complexity++;
      if (/\b(try|finally)\b/.test(trimmed)) complexity++;
      
      // Function definitions
      if (/\b(function|def|class|interface)\b/.test(trimmed)) complexity += 2;
      
      // Nested structures (simple heuristic)
      const indentLevel = (line.match(/^\s*/)?.[0].length || 0) / 2;
      if (indentLevel > 3) complexity++;
    }
    
    return Math.min(10, Math.round(complexity / Math.max(1, lines.length / 100)));
  }

  /**
   * Identify risk factors in the file
   */
  identifyRiskFactors(file) {
    const riskFactors = [];
    const content = file.content.toLowerCase();
    const path = file.path.toLowerCase();
    
    // Check for security-critical patterns
    if (/\b(password|secret|key|token|credential)\b/.test(content)) {
      riskFactors.push('credentials');
    }
    
    if (/\b(sql|database|query)\b/.test(content)) {
      riskFactors.push('database');
    }
    
    if (/\b(auth|login|jwt|session)\b/.test(content)) {
      riskFactors.push('authentication');
    }
    
    if (/\b(payment|billing|stripe|paypal)\b/.test(content)) {
      riskFactors.push('payment');
    }
    
    if (/\b(api|endpoint|rest|graphql)\b/.test(content)) {
      riskFactors.push('api');
    }
    
    if (/\b(file|upload|download)\b/.test(content)) {
      riskFactors.push('file-handling');
    }
    
    // Check file path for risk indicators
    if (path.includes('config') || path.includes('.env')) {
      riskFactors.push('configuration');
    }
    
    if (path.includes('admin') || path.includes('root')) {
      riskFactors.push('administrative');
    }
    
    return riskFactors;
  }
}

/**
 * Context-Aware Diff Analyzer
 * Analyzes git diffs to focus on meaningful changes
 */
class ContextAwareDiffAnalyzer {
  analyzeDiff(diff, _context) {
    // This would analyze git diffs to understand what changed
    // For now, return basic diff information
    return {
      addedLines: this.countLines(diff, '+'),
      removedLines: this.countLines(diff, '-'),
      modifiedFiles: this.extractModifiedFiles(diff),
      riskAreas: this.identifyRiskAreas(diff)
    };
  }

  countLines(diff, prefix) {
    return (diff.match(new RegExp(`^${prefix}`, 'gm')) || []).length;
  }

  extractModifiedFiles(diff) {
    // Extract file paths from diff headers
    const filePattern = /^diff --git a\/(.+?) b\/\1$/gm;
    const files = [];
    let match;
    
    while ((match = filePattern.exec(diff)) !== null) {
      files.push(match[1]);
    }
    
    return files;
  }

  identifyRiskAreas(diff) {
    const riskAreas = [];
    
    // Look for high-risk changes in diff
    if (/^\+.*(password|secret|key)/mi.test(diff)) {
      riskAreas.push('credentials-added');
    }
    
    if (/^\+.*(eval|exec|system)/mi.test(diff)) {
      riskAreas.push('code-execution');
    }
    
    if (/^\+.*(sql|query)/mi.test(diff)) {
      riskAreas.push('database-changes');
    }
    
    return riskAreas;
  }
}

/**
 * Adaptive Prompt Tuner
 * Builds context-specific prompts for AI analysis
 */
class AdaptivePromptTuner {
  async buildAdaptivePrompt(file, context) {
    const basePrompt = this.getBasePrompt();
    const contextSpecific = this.getContextSpecificInstructions(context);
    const fileSpecific = this.getFileSpecificInstructions(file, context);
    const analysisDepth = this.getAnalysisDepthInstructions(context.analysisDepth);
    
    return {
      system: basePrompt,
      context: contextSpecific,
      fileSpecific: fileSpecific,
      analysisDepth: analysisDepth,
      instructions: this.getAnalysisInstructions(context)
    };
  }

  getBasePrompt() {
    return `You are a Senior Security Architect and Code Quality Expert (S-Tier). 
Your goal is to perform a deep, comprehensive analysis of the provided code, looking for subtle bugs, security vulnerabilities, and architectural improvements.

Analyze the code for:
1. 🛡️ Security: Vulnerabilities (OWASP Top 10), injection risks, auth bypasses, secret exposure.
2. 💎 Correctness: Logic errors, edge cases (null/undefined), race conditions, type safety.
3. ⚡ Performance: N+1 queries, memory leaks, inefficient algorithms, unnecessary re-renders.
4. 🧹 Elegance: Clean code principles, DRY, SOLID, idiomatic usage of the language.
5. 🛡️ Robustness: Error handling, input validation, boundary checks.

Think step-by-step. First, understand the code's intent. Then, simulate execution for edge cases. Finally, report issues.`;
  }

  getContextSpecificInstructions(context) {
    let instructions = `Context: ${context.analysisDepth} analysis of ${context.type} file`;
    
    if (context.isStaged) {
      instructions += '. Focus on staged changes only - analyze what was added/modified.';
    }
    
    if (context.riskFactors.length > 0) {
      instructions += `. This file contains high-risk areas: ${context.riskFactors.join(', ')}`;
    }
    
    instructions += `. Language: ${context.language}, Complexity: ${context.complexity}/10`;
    
    return instructions;
  }

  getFileSpecificInstructions(file, context) {
    const instructions = [];
    
    // File type specific instructions
    switch (context.type) {
      case 'authentication':
        instructions.push('Pay special attention to authentication flows, session management, and credential handling.');
        break;
      case 'api':
        instructions.push('Focus on input validation, output encoding, and API security best practices.');
        break;
      case 'payment':
        instructions.push('Examine payment processing, data encryption, and PCI compliance requirements.');
        break;
      case 'configuration':
        instructions.push('Check for hardcoded secrets, insecure defaults, and configuration vulnerabilities.');
        break;
    }
    
    // Language specific instructions
    switch (context.language) {
      case 'javascript':
      case 'typescript':
        instructions.push('Check for XSS vulnerabilities, unsafe DOM manipulation, and client-side security issues.');
        break;
      case 'python':
        instructions.push('Look for unsafe deserialization, command injection, and Python-specific security patterns.');
        break;
      case 'java':
        instructions.push('Examine for SQL injection, insecure serialization, and Java security vulnerabilities.');
        break;
    }
    
    return instructions.join(' ');
  }

  getAnalysisDepthInstructions(depth) {
    switch (depth) {
      case 'diff-focused':
        return 'Analyze only the changes made in this diff. Focus on new code and modifications.';
      case 'commit-focused':
        return 'Analyze the entire file as it appears in this commit, with focus on changes from previous version.';
      case 'comprehensive':
        return 'Perform comprehensive analysis of the entire file, including existing code patterns.';
      default:
        return 'Analyze the code thoroughly for security and quality issues.';
    }
  }

  getAnalysisInstructions(_context) {
    const instructions = [];
    
    // Severity guidelines
    instructions.push('Severity guidelines:');
    instructions.push('• Critical: Immediately exploitable vulnerabilities, data exposure risks');
    instructions.push('• High: Significant security risks, potential data breaches');
    instructions.push('• Medium: Moderate security concerns, best practice violations');
    instructions.push('• Low: Minor issues, optimization opportunities');
    instructions.push('• Info: Informational findings, general recommendations');
    
    // Output format
    instructions.push('\nOutput format: Return a JSON array of issues with:');
    instructions.push('- title: Brief issue description');
    instructions.push('- severity: One of [critical, high, medium, low, info]');
    instructions.push('- message: Detailed explanation');
    instructions.push('- suggestion: Specific remediation steps');
    instructions.push('- line: Line number (if applicable)');
    instructions.push('- tags: Relevant tags for categorization');
    
    return instructions.join('\n');
  }
}

export default EnhancedAIAnalyzer;
