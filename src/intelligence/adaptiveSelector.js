import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import { getSessionStore } from '../context/sessionStore.js';

export class AdaptiveStrategySelector {
  constructor(options = {}) {
    this.options = {
      useMLModel: options.useMLModel !== false,
      enableABTesting: options.enableABTesting || false,
      costWeight: options.costWeight || 0.2,
      performanceWeight: options.performanceWeight || 0.8,
      ...options
    };

    this.llm = null;
    this.sessionStore = null;
    this.strategyPerformance = new Map();
    this.featureWeights = this.initializeWeights();
  }

  async initialize() {
    this.llm = getLLMOrchestrator();
    this.sessionStore = getSessionStore();

    // Load historical performance data
    await this.loadPerformanceHistory();

    console.log('✅ Adaptive Strategy Selector initialized');
  }

  /**
   * SELECT BEST STRATEGY
   *
   * Main entry point - analyzes question and selects optimal strategy
   */
  async selectStrategy(question, context = {}) {
    console.log(`🎯 Analyzing question for strategy selection...`);

    // Step 1: Extract features from question
    const features = await this.extractFeatures(question, context);

    // Step 2: Calculate complexity scores
    const complexity = this.calculateComplexity(features);

    // Step 3: Get strategy candidates with scores
    const candidates = this.scoreStrategies(complexity, features);

    // Step 4: Apply performance history
    const rankedCandidates = this.rankByPerformance(candidates);

    // Step 5: Apply cost optimization
    const costOptimized = this.optimizeByCost(rankedCandidates);

    // Step 6: Select final strategy
    const selected = costOptimized[0];

    console.log(`✅ Selected strategy: ${selected.strategy} (confidence: ${selected.confidence.toFixed(2)})`);
    console.log(`📊 Analysis:`, {
      complexity: complexity.overall,
      features: this.summarizeFeatures(features),
      alternatives: costOptimized.slice(1, 3).map(c => ({
        strategy: c.strategy,
        score: c.score.toFixed(2)
      }))
    });

    return {
      strategy: selected.strategy,
      confidence: selected.confidence,
      reasoning: selected.reasoning,
      complexity,
      alternatives: costOptimized.slice(1, 3)
    };
  }

  /**
   * FEATURE EXTRACTION
   *
   * Extract 20+ features from question for ML classification
   */
  async extractFeatures(question, context) {
    const features = {
      // Text features
      questionLength: question.length,
      wordCount: question.split(/\s+/).length,
      sentenceCount: question.split(/[.!?]+/).length,

      // Semantic features
      hasWhere: /\b(where|which|what|locate|find)\b/i.test(question),
      hasHow: /\b(how|explain|describe)\b/i.test(question),
      hasWhy: /\b(why|reason|because)\b/i.test(question),
      hasCan: /\b(can|could|possible|able)\b/i.test(question),
      hasIs: /\b(is|are|was|were)\b/i.test(question),

      // Code-specific features
      hasFunction: /\b(function|method|procedure)\b/i.test(question),
      hasClass: /\b(class|object|instance)\b/i.test(question),
      hasAPI: /\b(api|endpoint|route|request|response)\b/i.test(question),
      hasDB: /\b(database|query|sql|table|model)\b/i.test(question),
      hasSecurity: /\b(security|secure|vulnerability|attack|exploit)\b/i.test(question),
      hasTest: /\b(test|spec|coverage|assert)\b/i.test(question),

      // Complexity indicators
      hasTrace: /\b(trace|track|follow|flow)\b/i.test(question),
      hasAll: /\b(all|every|each|entire)\b/i.test(question),
      hasMultiple: /\b(multiple|several|many|various)\b/i.test(question),
      hasRelation: /\b(relation|connect|depend|link|between)\b/i.test(question),

      // Action verbs
      hasFind: /\b(find|search|locate|discover)\b/i.test(question),
      hasShow: /\b(show|display|list|enumerate)\b/i.test(question),
      hasExplain: /\b(explain|describe|clarify|elaborate)\b/i.test(question),
      hasAnalyze: /\b(analyze|examine|investigate|inspect)\b/i.test(question),

      // Context features
      hasContext: Object.keys(context).length > 0,
      hasPreviousQuery: context.previousQuery !== undefined,
      hasFilePath: context.filePath !== undefined,

      // Extracted entities (using simple NER)
      entities: await this.extractEntities(question),

      // Keyword density
      keywordDensity: this.calculateKeywordDensity(question),

      // Ambiguity score
      ambiguityScore: this.calculateAmbiguity(question)
    };

    return features;
  }

  /**
   * COMPLEXITY CALCULATION
   *
   * Multi-dimensional complexity analysis
   */
  calculateComplexity(features, context = {}) {
    const complexity = {
      // Graph traversal complexity
      needsGraphTraversal: (
        features.hasTrace ||
        features.hasRelation ||
        features.hasFlow ||
        (features.entities.functions.length > 1) ||
        (features.entities.classes.length > 1)
      ) ? 0.8 : 0.2,

      // Multi-hop reasoning complexity
      needsMultiHop: (
        features.sentenceCount > 1 ||
        features.hasMultiple ||
        features.hasAll ||
        features.wordCount > 20
      ) ? 0.7 : 0.2,

      // Self-reflection complexity
      needsReflection: (
        features.hasWhy ||
        features.hasExplain ||
        features.hasSecurity ||
        features.ambiguityScore > 0.6
      ) ? 0.75 : 0.25,

      // Correction complexity
      needsCorrection: (
        features.ambiguityScore > 0.7 ||
        features.hasMultiple ||
        context.previousAttemptFailed
      ) ? 0.8 : 0.3,

      // Multi-domain complexity
      needsMultiDomain: (
        [
          features.hasSecurity,
          features.hasAPI,
          features.hasDB,
          features.hasTest
        ].filter(Boolean).length >= 2
      ) ? 0.85 : 0.2,

      // Hypothetical complexity
      needsHypothetical: (
        features.hasCan ||
        features.hasIs ||
        features.ambiguityScore > 0.5
      ) ? 0.6 : 0.2,

      // Simple complexity
      isSimple: (
        features.wordCount < 10 &&
        features.sentenceCount === 1 &&
        !features.hasMultiple &&
        features.ambiguityScore < 0.3
      ) ? 0.9 : 0.1
    };

    // Calculate overall complexity (0-1 scale)
    complexity.overall = (
      complexity.needsGraphTraversal * 0.2 +
      complexity.needsMultiHop * 0.15 +
      complexity.needsReflection * 0.15 +
      complexity.needsCorrection * 0.15 +
      complexity.needsMultiDomain * 0.2 +
      complexity.needsHypothetical * 0.1 +
      complexity.isSimple * -0.25
    );

    complexity.overall = Math.max(0, Math.min(1, complexity.overall));
    complexity.level = this.getComplexityLevel(complexity.overall);

    return complexity;
  }

  /**
   * STRATEGY SCORING
   *
   * Score each strategy based on complexity and features
   */
  scoreStrategies(complexity, features) {
    const strategies = [
      {
        name: 'simple',
        score: this.scoreSimple(complexity, features),
        cost: 1,
        avgLatency: 1.2
      },
      {
        name: 'self-rag',
        score: this.scoreSelfRAG(complexity, features),
        cost: 3,
        avgLatency: 2.8
      },
      {
        name: 'crag',
        score: this.scoreCRAG(complexity, features),
        cost: 2.5,
        avgLatency: 2.1
      },
      {
        name: 'graph',
        score: this.scoreGraphRAG(complexity, features),
        cost: 2,
        avgLatency: 1.8
      },
      {
        name: 'iterative',
        score: this.scoreIterative(complexity, features),
        cost: 4,
        avgLatency: 3.5
      },
      {
        name: 'hyde',
        score: this.scoreHyDE(complexity, features),
        cost: 2.5,
        avgLatency: 2.0
      },
      {
        name: 'agentic',
        score: this.scoreAgentic(complexity, features),
        cost: 3.5,
        avgLatency: 3.2
      }
    ];

    return strategies.map(s => ({
      strategy: s.name,
      score: s.score,
      cost: s.cost,
      avgLatency: s.avgLatency,
      confidence: this.calculateConfidence(s.score),
      reasoning: this.generateReasoning(s.name, complexity, features)
    }));
  }

  /**
   * INDIVIDUAL STRATEGY SCORERS
   */

  scoreSimple(complexity, features) {
    let score = 0;

    // Perfect for simple queries
    if (complexity.isSimple > 0.7) score += 0.8;

    // Good for direct questions
    if (features.hasIs || features.hasWhere) score += 0.1;

    // Bad for complex queries
    if (complexity.overall > 0.5) score -= 0.5;

    // Bad for multi-domain
    if (complexity.needsMultiDomain > 0.5) score -= 0.3;

    return Math.max(0, Math.min(1, score));
  }

  scoreSelfRAG(complexity, features) {
    let score = 0;

    // Great for reflection needs
    if (complexity.needsReflection > 0.6) score += 0.7;

    // Good for security questions
    if (features.hasSecurity) score += 0.2;

    // Good for complex explanations
    if (features.hasExplain && complexity.overall > 0.5) score += 0.3;

    // Overkill for simple queries
    if (complexity.isSimple > 0.7) score -= 0.4;

    return Math.max(0, Math.min(1, score));
  }

  scoreCRAG(complexity, features) {
    let score = 0;

    // Great for correction needs
    if (complexity.needsCorrection > 0.6) score += 0.7;

    // Good for ambiguous queries
    if (features.ambiguityScore > 0.6) score += 0.3;

    // Good for multiple options
    if (features.hasMultiple) score += 0.2;

    // Less useful for simple queries
    if (complexity.isSimple > 0.7) score -= 0.3;

    return Math.max(0, Math.min(1, score));
  }

  scoreGraphRAG(complexity, features) {
    let score = 0;

    // Perfect for graph traversal
    if (complexity.needsGraphTraversal > 0.7) score += 0.9;

    // Great for tracing
    if (features.hasTrace) score += 0.3;

    // Good for relationships
    if (features.hasRelation) score += 0.2;

    // Good for multiple entities
    if (features.entities.functions.length > 1) score += 0.2;

    // Not needed for simple queries
    if (complexity.isSimple > 0.7) score -= 0.4;

    return Math.max(0, Math.min(1, score));
  }

  scoreIterative(complexity, features) {
    let score = 0;

    // Perfect for multi-hop
    if (complexity.needsMultiHop > 0.7) score += 0.8;

    // Great for comprehensive answers
    if (features.hasAll || features.hasMultiple) score += 0.3;

    // Good for complex questions
    if (complexity.overall > 0.7) score += 0.2;

    // Overkill for simple
    if (complexity.isSimple > 0.7) score -= 0.5;

    return Math.max(0, Math.min(1, score));
  }

  scoreHyDE(complexity, features) {
    let score = 0;

    // Good for hypothetical
    if (complexity.needsHypothetical > 0.6) score += 0.7;

    // Good for "can" questions
    if (features.hasCan) score += 0.3;

    // Good for ambiguous
    if (features.ambiguityScore > 0.5) score += 0.2;

    return Math.max(0, Math.min(1, score));
  }

  scoreAgentic(complexity, features) {
    let score = 0;

    // Perfect for multi-domain
    if (complexity.needsMultiDomain > 0.7) score += 0.9;

    // Great for comprehensive analysis
    if (features.hasAnalyze) score += 0.3;

    // Good for complex questions
    if (complexity.overall > 0.6) score += 0.2;

    // Expensive for simple
    if (complexity.isSimple > 0.7) score -= 0.6;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * PERFORMANCE-BASED RANKING
   *
   * Adjust scores based on historical performance
   */
  rankByPerformance(candidates) {
    return candidates.map(candidate => {
      const history = this.strategyPerformance.get(candidate.strategy);

      if (history && history.attempts > 5) {
        // Boost score based on historical success rate
        const successRate = history.successes / history.attempts;
        const performanceBoost = (successRate - 0.5) * 0.2; // ±0.2 adjustment

        candidate.score += performanceBoost;
        candidate.historicalSuccessRate = successRate;
      }

      return candidate;
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * COST OPTIMIZATION
   *
   * Balance performance vs cost
   */
  optimizeByCost(candidates) {
    return candidates.map(candidate => {
      // Combined score: performance * weight + (1/cost) * weight
      const performanceComponent = candidate.score * this.options.performanceWeight;
      const costComponent = (1 / candidate.cost) * this.options.costWeight;

      candidate.optimizedScore = performanceComponent + costComponent;

      return candidate;
    }).sort((a, b) => b.optimizedScore - a.optimizedScore);
  }

  /**
   * HELPER METHODS
   */

  async extractEntities(text) {
    // Simple NER for code entities
    const entities = {
      functions: [],
      classes: [],
      variables: [],
      files: []
    };

    // Extract camelCase/PascalCase identifiers
    const identifiers = text.match(/\b[a-z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]*\b/g) || [];

    identifiers.forEach(id => {
      if (/^[A-Z]/.test(id)) {
        entities.classes.push(id);
      } else if (/^[a-z]/.test(id) && id.length > 3) {
        entities.functions.push(id);
      }
    });

    // Extract file paths
    const files = text.match(/[\w-]+\/[\w-/]+\.\w+/g) || [];
    entities.files = files;

    return entities;
  }

  calculateKeywordDensity(text) {
    const keywords = [
      'function', 'class', 'method', 'variable', 'api', 'database',
      'security', 'test', 'authentication', 'authorization', 'validation'
    ];

    const words = text.toLowerCase().split(/\s+/);
    const keywordCount = words.filter(w => keywords.includes(w)).length;

    return keywordCount / words.length;
  }

  calculateAmbiguity(text) {
    let score = 0;

    // Multiple question marks
    if ((text.match(/\?/g) || []).length > 1) score += 0.3;

    // Vague terms
    if (/\b(something|somehow|maybe|perhaps)\b/i.test(text)) score += 0.4;

    // Short question with complex topic
    if (text.split(/\s+/).length < 5 && /\b(security|architecture|system)\b/i.test(text)) {
      score += 0.3;
    }

    return Math.min(1, score);
  }

  getComplexityLevel(score) {
    if (score < 0.3) return 'simple';
    if (score < 0.5) return 'moderate';
    if (score < 0.7) return 'complex';
    return 'very_complex';
  }

  calculateConfidence(score) {
    // Convert score to confidence (with sigmoid)
    return 1 / (1 + Math.exp(-5 * (score - 0.5)));
  }

  generateReasoning(strategy, complexity, _features) {
    const reasons = [];

    if (strategy === 'simple' && complexity.isSimple > 0.7) {
      reasons.push('Question is straightforward');
    }
    if (strategy === 'graph' && complexity.needsGraphTraversal > 0.7) {
      reasons.push('Requires tracing code relationships');
    }
    if (strategy === 'agentic' && complexity.needsMultiDomain > 0.7) {
      reasons.push('Spans multiple domains');
    }
    if (strategy === 'self-rag' && complexity.needsReflection > 0.7) {
      reasons.push('Requires self-reflection and verification');
    }
    if (strategy === 'crag' && complexity.needsCorrection > 0.7) {
      reasons.push('May need retrieval correction');
    }
    if (strategy === 'iterative' && complexity.needsMultiHop > 0.7) {
      reasons.push('Requires multi-hop reasoning');
    }

    return reasons.join('; ');
  }

  summarizeFeatures(features) {
    return {
      length: features.questionLength,
      words: features.wordCount,
      entities: features.entities.functions.length + features.entities.classes.length,
      complexity: features.ambiguityScore > 0.5 ? 'high' : 'low'
    };
  }

  /**
   * PERFORMANCE TRACKING
   */

  recordPerformance(strategy, success, metrics = {}) {
    if (!this.strategyPerformance.has(strategy)) {
      this.strategyPerformance.set(strategy, {
        attempts: 0,
        successes: 0,
        totalLatency: 0,
        totalCost: 0
      });
    }

    const perf = this.strategyPerformance.get(strategy);
    perf.attempts++;
    if (success) perf.successes++;
    if (metrics.latency) perf.totalLatency += metrics.latency;
    if (metrics.cost) perf.totalCost += metrics.cost;

    // Save to session store
    this.sessionStore?.setKnowledge(
      'global',
      'strategy_performance',
      strategy,
      perf,
      1.0,
      'learned'
    );
  }

  async loadPerformanceHistory() {
    if (!this.sessionStore) return;

    const history = this.sessionStore.getKnowledge('global', 'strategy_performance');

    history.forEach(record => {
      this.strategyPerformance.set(record.key, record.value);
    });

    console.log(`📊 Loaded performance history for ${this.strategyPerformance.size} strategies`);
  }

  /**
   * Initialize feature weights for ML model
   */
  initializeWeights() {
    return {
      questionLength: 0.05,
      wordCount: 0.08,
      hasTrace: 0.15,
      hasRelation: 0.12,
      hasMultiple: 0.10,
      hasSecurity: 0.10,
      ambiguityScore: 0.15,
      entities: 0.12,
      keywordDensity: 0.08,
      contextPresence: 0.05
    };
  }
}

// Factory function
export function createAdaptiveSelector(options) {
  return new AdaptiveStrategySelector(options);
}

export default AdaptiveStrategySelector;
