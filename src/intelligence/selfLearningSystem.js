/**
 * SELF-LEARNING SYSTEM
 *
 * Reinforcement Learning from Human Feedback (RLHF) inspired system
 * that continuously improves from user interactions
 *
 * Features:
 * - Reward model trained from user feedback
 * - Policy improvement through reinforcement learning
 * - Curriculum learning for progressive difficulty
 * - Self-play and self-evaluation
 * - Online learning with continuous adaptation
 * - Performance tracking and drift detection
 * - Experience replay buffer
 * - Multi-armed bandit for exploration vs exploitation
 *
 * Inspired by:
 * - Anthropic's Constitutional AI
 * - OpenAI's RLHF
 * - DeepMind's AlphaGo self-play
 */

import { getSessionStore } from '../context/sessionStore.js';
import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import crypto from 'crypto';

export class SelfLearningSystem {
  constructor(options = {}) {
    this.options = {
      rewardModelPath: options.rewardModelPath || 'models/reward_model.json',
      policyPath: options.policyPath || 'models/policy.json',
      experienceBufferSize: options.experienceBufferSize || 10000,
      batchSize: options.batchSize || 32,
      learningRate: options.learningRate || 0.001,
      explorationRate: options.explorationRate || 0.1,
      explorationDecay: options.explorationDecay || 0.995,
      minExplorationRate: options.minExplorationRate || 0.01,
      updateFrequency: options.updateFrequency || 100, // Update policy every N interactions
      selfPlayFrequency: options.selfPlayFrequency || 1000,
      curriculumLevels: options.curriculumLevels || 5,
      ...options
    };

    this.sessionStore = null;
    this.llm = null;

    // Reward model: learns to predict user satisfaction
    this.rewardModel = {
      weights: new Map(),
      featureCount: 0,
      trainingExamples: 0
    };

    // Policy: decides which action to take
    this.policy = {
      strategyPreferences: new Map(), // strategy -> quality score
      actionValues: new Map(), // (state, action) -> expected reward
      visitCounts: new Map() // (state, action) -> visit count
    };

    // Experience replay buffer
    this.experienceBuffer = [];

    // Learning metrics
    this.metrics = {
      totalInteractions: 0,
      rewardSignals: 0,
      avgReward: 0,
      policyUpdates: 0,
      explorationRate: this.options.explorationRate,
      currentLevel: 1,
      levelProgress: 0
    };

    // Multi-armed bandit for strategy selection
    this.bandit = {
      arms: new Map(), // strategy -> {pulls, totalReward, avgReward}
      epsilon: this.options.explorationRate
    };
  }

  async initialize() {
    this.sessionStore = getSessionStore();
    this.llm = getLLMOrchestrator();

    // Load saved models
    await this.loadRewardModel();
    await this.loadPolicy();

    // Initialize bandit arms for each strategy
    const strategies = ['simple', 'self-rag', 'crag', 'graph', 'iterative', 'hyde', 'agentic'];
    strategies.forEach(strategy => {
      if (!this.bandit.arms.has(strategy)) {
        this.bandit.arms.set(strategy, {
          pulls: 0,
          totalReward: 0,
          avgReward: 0.5 // Start with neutral expectation
        });
      }
    });

    console.log('✅ Self-Learning System initialized');
    console.log(`📊 Training examples: ${this.rewardModel.trainingExamples}`);
    console.log(`🎯 Policy updates: ${this.metrics.policyUpdates}`);
  }

  /**
   * RECORD INTERACTION
   *
   * Store interaction in experience buffer for learning
   */
  recordInteraction(state, action, reward, nextState, metadata = {}) {
    const experience = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      state,
      action,
      reward,
      nextState,
      metadata
    };

    // Add to experience buffer
    this.experienceBuffer.push(experience);

    // Maintain buffer size limit
    if (this.experienceBuffer.length > this.options.experienceBufferSize) {
      this.experienceBuffer.shift();
    }

    // Update metrics
    this.metrics.totalInteractions++;
    this.metrics.rewardSignals++;
    this.metrics.avgReward = (
      (this.metrics.avgReward * (this.metrics.rewardSignals - 1) + reward) /
      this.metrics.rewardSignals
    );

    // Update multi-armed bandit
    this.updateBandit(action.strategy, reward);

    // Trigger learning if we have enough experiences
    if (this.metrics.totalInteractions % this.options.updateFrequency === 0) {
      this.learn();
    }

    // Trigger self-play periodically
    if (this.metrics.totalInteractions % this.options.selfPlayFrequency === 0) {
      this.selfPlay();
    }

    return experience;
  }

  /**
   * LEARN FROM EXPERIENCE
   *
   * Update reward model and policy from experience buffer
   */
  async learn() {
    console.log('🧠 Learning from experience buffer...');

    // Sample mini-batch from experience buffer
    const batch = this.sampleExperience(this.options.batchSize);

    // Update reward model
    await this.updateRewardModel(batch);

    // Update policy
    await this.updatePolicy(batch);

    // Decay exploration rate
    this.metrics.explorationRate = Math.max(
      this.options.minExplorationRate,
      this.metrics.explorationRate * this.options.explorationDecay
    );
    this.bandit.epsilon = this.metrics.explorationRate;

    this.metrics.policyUpdates++;

    // Save models periodically
    if (this.metrics.policyUpdates % 10 === 0) {
      await this.saveRewardModel();
      await this.savePolicy();
    }

    console.log(`✅ Policy updated (${this.metrics.policyUpdates} total updates)`);
    console.log(`📊 Avg reward: ${this.metrics.avgReward.toFixed(3)}, Exploration: ${this.metrics.explorationRate.toFixed(3)}`);
  }

  /**
   * UPDATE REWARD MODEL
   *
   * Train reward model to predict user satisfaction
   */
  async updateRewardModel(batch) {
    for (const experience of batch) {
      const features = this.extractFeatures(experience.state, experience.action);

      // Update weights using gradient descent
      const predicted = this.predictReward(features);
      const error = experience.reward - predicted;

      // Update each feature weight
      for (const [feature, value] of Object.entries(features)) {
        const currentWeight = this.rewardModel.weights.get(feature) || 0;
        const gradient = error * value;
        const newWeight = currentWeight + this.options.learningRate * gradient;

        this.rewardModel.weights.set(feature, newWeight);
      }
    }

    this.rewardModel.trainingExamples += batch.length;
  }

  /**
   * UPDATE POLICY
   *
   * Improve action selection policy using Q-learning
   */
  async updatePolicy(batch) {
    const gamma = 0.95; // Discount factor for future rewards

    for (const experience of batch) {
      const stateKey = this.hashState(experience.state);
      const actionKey = `${stateKey}:${experience.action.strategy}`;

      // Get current Q-value
      const currentQ = this.policy.actionValues.get(actionKey) || 0;

      // Get max Q-value for next state
      const nextStateKey = this.hashState(experience.nextState);
      const nextStateActions = Array.from(this.policy.actionValues.entries())
        .filter(([key]) => key.startsWith(nextStateKey));

      const maxNextQ = nextStateActions.length > 0
        ? Math.max(...nextStateActions.map(([, value]) => value))
        : 0;

      // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
      const newQ = currentQ + this.options.learningRate * (
        experience.reward + gamma * maxNextQ - currentQ
      );

      this.policy.actionValues.set(actionKey, newQ);

      // Update visit count
      const visits = this.policy.visitCounts.get(actionKey) || 0;
      this.policy.visitCounts.set(actionKey, visits + 1);

      // Update strategy preferences (aggregated Q-values)
      const strategy = experience.action.strategy;
      const currentPref = this.policy.strategyPreferences.get(strategy) || 0.5;
      const newPref = currentPref + this.options.learningRate * (experience.reward - currentPref);
      this.policy.strategyPreferences.set(strategy, newPref);
    }
  }

  /**
   * SELECT ACTION (with exploration vs exploitation)
   *
   * Choose strategy using epsilon-greedy policy
   */
  selectAction(state, availableActions) {
    // Epsilon-greedy: explore with probability ε, exploit otherwise
    if (Math.random() < this.metrics.explorationRate) {
      // Explore: random action
      const randomIndex = Math.floor(Math.random() * availableActions.length);
      return {
        action: availableActions[randomIndex],
        method: 'exploration'
      };
    } else {
      // Exploit: best action according to policy
      const stateKey = this.hashState(state);

      let bestAction = availableActions[0];
      let bestQ = -Infinity;

      for (const action of availableActions) {
        const actionKey = `${stateKey}:${action.strategy}`;
        const q = this.policy.actionValues.get(actionKey) || 0;

        // Add UCB exploration bonus
        const visits = this.policy.visitCounts.get(actionKey) || 1;
        const totalVisits = this.metrics.totalInteractions || 1;
        const ucbBonus = Math.sqrt(2 * Math.log(totalVisits) / visits);
        const score = q + 0.1 * ucbBonus;

        if (score > bestQ) {
          bestQ = score;
          bestAction = action;
        }
      }

      return {
        action: bestAction,
        method: 'exploitation',
        qValue: bestQ
      };
    }
  }

  /**
   * MULTI-ARMED BANDIT STRATEGY SELECTION
   *
   * Use Thompson Sampling for strategy selection
   */
  selectStrategyBandit() {
    const strategies = Array.from(this.bandit.arms.keys());

    // Thompson Sampling: sample from beta distribution for each arm
    const samples = strategies.map(strategy => {
      const arm = this.bandit.arms.get(strategy);

      // Beta distribution parameters (assuming binary rewards)
      const alpha = arm.totalReward + 1;
      const beta = (arm.pulls - arm.totalReward) + 1;

      // Sample from beta distribution (simplified using random)
      const sample = this.sampleBeta(alpha, beta);

      return { strategy, sample };
    });

    // Select strategy with highest sample
    samples.sort((a, b) => b.sample - a.sample);

    return samples[0].strategy;
  }

  /**
   * UPDATE BANDIT
   */
  updateBandit(strategy, reward) {
    const arm = this.bandit.arms.get(strategy);

    if (!arm) return;

    arm.pulls++;
    arm.totalReward += reward;
    arm.avgReward = arm.totalReward / arm.pulls;
  }

  /**
   * SELF-PLAY
   *
   * Generate synthetic queries and evaluate responses
   */
  async selfPlay() {
    console.log('🎮 Starting self-play session...');

    const syntheticQueries = await this.generateSyntheticQueries(10);

    for (const query of syntheticQueries) {
      // Try all strategies
      const strategies = ['simple', 'self-rag', 'crag', 'graph', 'iterative', 'hyde', 'agentic'];

      for (const strategy of strategies) {
        // Evaluate this strategy on the synthetic query
        const evaluation = await this.evaluateStrategy(query, strategy);

        // Record as experience
        const state = {
          query: query.question,
          complexity: query.complexity,
          features: query.features
        };

        const action = { strategy };
        const reward = evaluation.score;
        const nextState = state;

        this.recordInteraction(state, action, reward, nextState, {
          type: 'self_play',
          evaluation
        });
      }
    }

    console.log('✅ Self-play session complete');
  }

  /**
   * GENERATE SYNTHETIC QUERIES
   *
   * Create training data through synthetic query generation
   */
  async generateSyntheticQueries(count) {
    const templates = [
      { question: 'Where is {entity} defined?', complexity: 'simple', features: { hasWhere: true } },
      { question: 'How does {entity} work?', complexity: 'moderate', features: { hasHow: true } },
      { question: 'Trace the flow from {entity1} to {entity2}', complexity: 'complex', features: { hasTrace: true, hasRelation: true } },
      { question: 'What are the security implications of {entity}?', complexity: 'complex', features: { hasSecurity: true } },
      { question: 'Find all calls to {entity}', complexity: 'moderate', features: { hasFind: true, hasAll: true } }
    ];

    const entities = ['authenticate', 'processPayment', 'validateInput', 'UserController', 'Database'];

    const queries = [];

    for (let i = 0; i < count; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const entity1 = entities[Math.floor(Math.random() * entities.length)];
      const entity2 = entities[Math.floor(Math.random() * entities.length)];

      const question = template.question
        .replace('{entity}', entity1)
        .replace('{entity1}', entity1)
        .replace('{entity2}', entity2);

      queries.push({
        question,
        complexity: template.complexity,
        features: template.features
      });
    }

    return queries;
  }

  /**
   * EVALUATE STRATEGY
   *
   * Assess strategy performance on a query
   */
  async evaluateStrategy(query, strategy) {
    // Simulate evaluation (in production, would use actual RAG pipeline)
    const baseScore = Math.random();

    // Adjust based on strategy appropriateness
    let score = baseScore;

    if (query.complexity === 'simple' && strategy === 'simple') {
      score += 0.3;
    } else if (query.complexity === 'complex' && ['self-rag', 'iterative', 'agentic'].includes(strategy)) {
      score += 0.3;
    } else if (query.features.hasTrace && strategy === 'graph') {
      score += 0.4;
    } else if (query.features.hasSecurity && strategy === 'self-rag') {
      score += 0.3;
    }

    score = Math.min(1, Math.max(0, score));

    return {
      score,
      strategy,
      query: query.question,
      appropriateness: score > 0.7 ? 'good' : score > 0.4 ? 'moderate' : 'poor'
    };
  }

  /**
   * CURRICULUM LEARNING
   *
   * Progressively increase task difficulty
   */
  getCurriculumLevel() {
    const progress = this.metrics.totalInteractions;

    // Define level thresholds
    const levelThresholds = [0, 100, 500, 1500, 3000];

    let level = 1;
    for (let i = 0; i < levelThresholds.length; i++) {
      if (progress >= levelThresholds[i]) {
        level = i + 1;
      }
    }

    return Math.min(level, this.options.curriculumLevels);
  }

  getCurriculumTasks(level) {
    const curricula = {
      1: { types: ['simple', 'where', 'is'], difficulty: 'easy' },
      2: { types: ['simple', 'where', 'how', 'show'], difficulty: 'easy-moderate' },
      3: { types: ['moderate', 'trace', 'find', 'analyze'], difficulty: 'moderate' },
      4: { types: ['complex', 'relation', 'security', 'multiple'], difficulty: 'complex' },
      5: { types: ['all'], difficulty: 'very_complex' }
    };

    return curricula[level] || curricula[5];
  }

  /**
   * HELPER METHODS
   */

  extractFeatures(state, action) {
    return {
      // State features
      queryLength: state.query?.length || 0,
      complexity: this.complexityToNumber(state.complexity),
      hasTrace: state.features?.hasTrace ? 1 : 0,
      hasRelation: state.features?.hasRelation ? 1 : 0,
      hasSecurity: state.features?.hasSecurity ? 1 : 0,
      hasMultiple: state.features?.hasMultiple ? 1 : 0,

      // Action features
      strategySimple: action.strategy === 'simple' ? 1 : 0,
      strategySelfRag: action.strategy === 'self-rag' ? 1 : 0,
      strategyCrag: action.strategy === 'crag' ? 1 : 0,
      strategyGraph: action.strategy === 'graph' ? 1 : 0,
      strategyIterative: action.strategy === 'iterative' ? 1 : 0,
      strategyHyde: action.strategy === 'hyde' ? 1 : 0,
      strategyAgentic: action.strategy === 'agentic' ? 1 : 0,

      // Interaction features
      complexityMatch: this.checkComplexityMatch(state.complexity, action.strategy)
    };
  }

  predictReward(features) {
    let prediction = 0;

    for (const [feature, value] of Object.entries(features)) {
      const weight = this.rewardModel.weights.get(feature) || 0;
      prediction += weight * value;
    }

    // Sigmoid to bound between 0 and 1
    return 1 / (1 + Math.exp(-prediction));
  }

  complexityToNumber(complexity) {
    const mapping = { simple: 0.2, moderate: 0.5, complex: 0.8, very_complex: 1.0 };
    return mapping[complexity] || 0.5;
  }

  checkComplexityMatch(complexity, strategy) {
    const goodMatches = {
      simple: ['simple'],
      moderate: ['simple', 'hyde', 'crag'],
      complex: ['self-rag', 'graph', 'iterative', 'agentic'],
      very_complex: ['self-rag', 'iterative', 'agentic']
    };

    return goodMatches[complexity]?.includes(strategy) ? 1 : 0;
  }

  hashState(state) {
    const stateStr = JSON.stringify({
      complexity: state.complexity,
      features: state.features
    });
    return crypto.createHash('md5').update(stateStr).digest('hex').substring(0, 8);
  }

  sampleExperience(batchSize) {
    if (this.experienceBuffer.length === 0) return [];

    // Prioritized experience replay: sample more recent experiences with higher probability
    const priorities = this.experienceBuffer.map((exp, idx) => {
      const recency = (idx + 1) / this.experienceBuffer.length;
      return recency;
    });

    const batch = [];

    for (let i = 0; i < Math.min(batchSize, this.experienceBuffer.length); i++) {
      // Sample with probability proportional to priority
      const totalPriority = priorities.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalPriority;

      for (let j = 0; j < priorities.length; j++) {
        rand -= priorities[j];
        if (rand <= 0) {
          batch.push(this.experienceBuffer[j]);
          break;
        }
      }
    }

    return batch;
  }

  sampleBeta(alpha, beta) {
    // Simplified beta distribution sampling
    // In production, use proper beta distribution library
    const gamma1 = this.sampleGamma(alpha, 1);
    const gamma2 = this.sampleGamma(beta, 1);
    return gamma1 / (gamma1 + gamma2);
  }

  sampleGamma(shape, scale) {
    // Simplified gamma distribution sampling
    // Using Marsaglia and Tsang's method
    if (shape < 1) {
      return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    let iterations = 0;
    const maxIterations = 1000;

    while (iterations < maxIterations) {
      iterations++;
      let x, v;
      do {
        x = this.sampleNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v * scale;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  sampleNormal(mean, stdDev) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * PERSISTENCE
   */

  async loadRewardModel() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'self_learning', 'reward_model');
      if (saved.length > 0) {
        const data = saved[0].value;
        this.rewardModel.weights = new Map(data.weights);
        this.rewardModel.trainingExamples = data.trainingExamples || 0;
        console.log(`📂 Loaded reward model (${this.rewardModel.trainingExamples} examples)`);
      }
    } catch (error) {
      console.log('Starting with fresh reward model');
    }
  }

  async saveRewardModel() {
    const data = {
      weights: Array.from(this.rewardModel.weights.entries()),
      trainingExamples: this.rewardModel.trainingExamples,
      timestamp: Date.now()
    };

    this.sessionStore.setKnowledge(
      'global',
      'self_learning',
      'reward_model',
      data,
      1.0,
      'learned'
    );
  }

  async loadPolicy() {
    try {
      const saved = this.sessionStore.getKnowledge('global', 'self_learning', 'policy');
      if (saved.length > 0) {
        const data = saved[0].value;
        this.policy.strategyPreferences = new Map(data.strategyPreferences);
        this.policy.actionValues = new Map(data.actionValues);
        this.policy.visitCounts = new Map(data.visitCounts);
        this.metrics.policyUpdates = data.policyUpdates || 0;
        console.log(`📂 Loaded policy (${this.metrics.policyUpdates} updates)`);
      }
    } catch (error) {
      console.log('Starting with fresh policy');
    }
  }

  async savePolicy() {
    const data = {
      strategyPreferences: Array.from(this.policy.strategyPreferences.entries()),
      actionValues: Array.from(this.policy.actionValues.entries()),
      visitCounts: Array.from(this.policy.visitCounts.entries()),
      policyUpdates: this.metrics.policyUpdates,
      timestamp: Date.now()
    };

    this.sessionStore.setKnowledge(
      'global',
      'self_learning',
      'policy',
      data,
      1.0,
      'learned'
    );
  }

  /**
   * GET LEARNING STATS
   */
  getStats() {
    return {
      totalInteractions: this.metrics.totalInteractions,
      avgReward: this.metrics.avgReward,
      policyUpdates: this.metrics.policyUpdates,
      explorationRate: this.metrics.explorationRate,
      experienceBufferSize: this.experienceBuffer.length,
      rewardModelFeatures: this.rewardModel.weights.size,
      trainingExamples: this.rewardModel.trainingExamples,
      currentLevel: this.getCurriculumLevel(),
      strategyPerformance: Object.fromEntries(
        Array.from(this.bandit.arms.entries()).map(([strategy, arm]) => [
          strategy,
          {
            pulls: arm.pulls,
            avgReward: arm.avgReward.toFixed(3),
            confidence: arm.pulls > 10 ? 'high' : arm.pulls > 3 ? 'medium' : 'low'
          }
        ])
      )
    };
  }
}

// Factory function
export function createSelfLearningSystem(options) {
  return new SelfLearningSystem(options);
}

export default SelfLearningSystem;
