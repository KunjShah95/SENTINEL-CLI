/**
 * MULTI-AGENT ORCHESTRATOR
 *
 * Coordinates multiple specialized agents with intelligent routing,
 * conflict resolution, and result synthesis
 *
 * Features:
 * - Dynamic agent selection based on question analysis
 * - Parallel execution with coordination
 * - Conflict resolution between agents
 * - Confidence-weighted synthesis
 * - Agent performance tracking
 * - Load balancing across agents
 */

import { SecurityAgent, ArchitectureAgent, APIAgent, DatabaseAgent, TestAgent, DocumentationAgent } from '../rag/agentSystem.js';
import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';

export class MultiAgentOrchestrator {
  constructor(options = {}) {
    this.options = {
      maxParallelAgents: options.maxParallelAgents || 6,
      minConfidence: options.minConfidence || 0.7,
      consensusThreshold: options.consensusThreshold || 0.75,
      enableConflictResolution: options.enableConflictResolution !== false,
      ...options
    };

    this.agents = this.initializeAgents();
    this.agentPerformance = new Map();
    this.llm = null;
  }

  async initialize() {
    this.llm = getLLMOrchestrator();

    // Load agent performance history
    for (const agent of this.agents) {
      this.agentPerformance.set(agent.name, {
        queries: 0,
        successes: 0,
        avgConfidence: 0,
        avgLatency: 0,
        specializations: []
      });
    }

    console.log(`✅ Multi-Agent Orchestrator initialized with ${this.agents.length} agents`);
  }

  /**
   * ORCHESTRATE - Main entry point
   */
  async orchestrate(question, vectorDB, options = {}) {
    console.log(`🤖 Orchestrating agents for query...`);

    // Step 1: Analyze question and select agents
    const selectedAgents = await this.selectAgents(question);
    console.log(`📋 Selected ${selectedAgents.length} agents:`, selectedAgents.map(a => a.name));

    // Step 2: Execute agents in parallel
    const agentResults = await this.executeAgentsParallel(
      selectedAgents,
      question,
      vectorDB,
      options
    );

    // Step 3: Validate and score results
    const validatedResults = await this.validateResults(agentResults);

    // Step 4: Resolve conflicts if any
    const resolvedResults = this.options.enableConflictResolution
      ? await this.resolveConflicts(validatedResults, question)
      : validatedResults;

    // Step 5: Synthesize final answer
    const synthesis = await this.synthesize(resolvedResults, question);

    // Step 6: Update agent performance metrics
    this.updatePerformance(selectedAgents, synthesis);

    return {
      answer: synthesis.answer,
      confidence: synthesis.confidence,
      agents: selectedAgents.map(a => a.name),
      agentContributions: synthesis.contributions,
      conflicts: synthesis.conflicts || [],
      sources: synthesis.sources
    };
  }

  /**
   * AGENT SELECTION
   *
   * Analyze question and select most relevant agents
   */
  async selectAgents(question) {
    const questionAnalysis = await this.analyzeQuestion(question);

    const scores = this.agents.map(agent => ({
      agent,
      score: this.scoreAgentRelevance(agent, questionAnalysis),
      performance: this.agentPerformance.get(agent.name)
    }));

    // Filter by minimum relevance + boost by historical performance
    const relevant = scores
      .filter(s => s.score > 0.3)
      .map(s => {
        // Boost score by historical success rate
        const successRate = s.performance.queries > 0
          ? s.performance.successes / s.performance.queries
          : 0.5;

        s.finalScore = s.score * 0.7 + successRate * 0.3;
        return s;
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    // Select top agents up to max parallel limit
    const selected = relevant
      .slice(0, this.options.maxParallelAgents)
      .map(s => s.agent);

    // Always include at least one agent
    if (selected.length === 0) {
      selected.push(this.agents[0]); // Default to first agent
    }

    return selected;
  }

  /**
   * PARALLEL EXECUTION
   */
  async executeAgentsParallel(agents, question, vectorDB, options) {
    const executions = agents.map(agent =>
      this.executeAgent(agent, question, vectorDB, options)
        .catch(error => ({
          agent: agent.name,
          error: error.message,
          success: false
        }))
    );

    const results = await Promise.all(executions);

    return results.filter(r => r.success !== false);
  }

  /**
   * EXECUTE SINGLE AGENT
   */
  async executeAgent(agent, question, vectorDB, options) {
    const startTime = Date.now();

    try {
      // Agent retrieves relevant code
      const retrieved = await agent.retrieve(question, vectorDB, {
        topK: options.topK || 10
      });

      // Generate agent-specific insights
      const insights = await this.generateAgentInsights(
        agent,
        question,
        retrieved
      );

      const latency = Date.now() - startTime;

      return {
        agent: agent.name,
        success: true,
        retrieved,
        insights,
        confidence: insights.confidence,
        latency
      };
    } catch (error) {
      console.error(`Agent ${agent.name} failed:`, error.message);
      return {
        agent: agent.name,
        success: false,
        error: error.message,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * GENERATE AGENT INSIGHTS
   */
  async generateAgentInsights(agent, question, retrieved) {
    const context = retrieved
      .map(r => `[${r.metadata.file}]\n${r.metadata.content}`)
      .join('\n\n');

    const prompt = `As a ${agent.name}, analyze this code for: ${question}

Context:
${context}

Provide:
1. Your analysis
2. Confidence (0-1)
3. Key findings

Format: JSON`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: `You are a specialized ${agent.name}.` },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 500
      });

      // Parse JSON response
      const insights = this.parseInsights(response);

      return {
        analysis: insights.analysis || response,
        confidence: insights.confidence || 0.7,
        findings: insights.findings || []
      };
    } catch (error) {
      return {
        analysis: 'Analysis failed',
        confidence: 0.3,
        findings: []
      };
    }
  }

  /**
   * VALIDATE RESULTS
   *
   * Cross-validate findings across agents
   */
  async validateResults(agentResults) {
    return agentResults.map(result => {
      // Check confidence threshold
      const meetsThreshold = result.confidence >= this.options.minConfidence;

      // Check consistency with other agents
      const consistency = this.calculateConsistency(result, agentResults);

      return {
        ...result,
        validated: meetsThreshold && consistency > 0.5,
        consistency
      };
    });
  }

  /**
   * CONFLICT RESOLUTION
   *
   * Resolve disagreements between agents
   */
  async resolveConflicts(results, question) {
    const conflicts = this.detectConflicts(results);

    if (conflicts.length === 0) {
      return results;
    }

    console.log(`⚠️  Detected ${conflicts.length} conflicts, resolving...`);

    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict, question);
      conflict.resolution = resolution;
    }

    return results;
  }

  /**
   * DETECT CONFLICTS
   */
  detectConflicts(results) {
    const conflicts = [];

    // Compare each pair of agents
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const r1 = results[i];
        const r2 = results[j];

        // Check if findings contradict
        const contradiction = this.findContradictions(
          r1.insights.findings,
          r2.insights.findings
        );

        if (contradiction) {
          conflicts.push({
            agents: [r1.agent, r2.agent],
            type: 'contradiction',
            details: contradiction,
            result1: r1,
            result2: r2
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * RESOLVE SINGLE CONFLICT
   */
  async resolveConflict(conflict, question) {
    // Use LLM to arbitrate
    const prompt = `Two agents disagree:

Agent ${conflict.agents[0]}: ${JSON.stringify(conflict.result1.insights.findings)}
Agent ${conflict.agents[1]}: ${JSON.stringify(conflict.result2.insights.findings)}

Question: ${question}

Which agent is more accurate and why? Provide resolution.`;

    const resolution = await this.llm.chat([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.1,
      maxTokens: 300
    });

    return {
      decision: resolution,
      confidence: 0.8
    };
  }

  /**
   * SYNTHESIZE FINAL ANSWER
   *
   * Combine insights from all agents
   */
  async synthesize(results, question) {
    // Weight by confidence and consistency
    const weighted = results.map(r => ({
      ...r,
      weight: r.confidence * r.consistency
    }));

    // Sort by weight
    weighted.sort((a, b) => b.weight - a.weight);

    // Build synthesis context
    const context = weighted
      .map(r => `[${r.agent}] ${r.insights.analysis}`)
      .join('\n\n');

    // Generate synthesis
    const prompt = `Synthesize these agent analyses into a comprehensive answer:

${context}

Question: ${question}

Provide a unified answer that:
1. Combines all insights
2. Resolves any contradictions
3. Highlights key findings`;

    const synthesis = await this.llm.chat([
      { role: 'system', content: 'Synthesize multiple expert analyses.' },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.5,
      maxTokens: 1000
    });

    // Calculate overall confidence (weighted average)
    const totalWeight = weighted.reduce((sum, r) => sum + r.weight, 0);
    const avgConfidence = weighted.reduce((sum, r) =>
      sum + (r.confidence * r.weight), 0
    ) / totalWeight;

    // Extract sources
    const sources = weighted.flatMap(r =>
      r.retrieved.map(ret => ({
        file: ret.metadata.file,
        agent: r.agent
      }))
    );

    return {
      answer: synthesis,
      confidence: avgConfidence,
      contributions: weighted.map(r => ({
        agent: r.agent,
        weight: r.weight,
        confidence: r.confidence
      })),
      sources: this.deduplicateSources(sources)
    };
  }

  /**
   * HELPER METHODS
   */

  analyzeQuestion(question) {
    return {
      hasSecurity: /security|vulnerability|attack|exploit/i.test(question),
      hasArchitecture: /architecture|design|pattern|structure/i.test(question),
      hasAPI: /api|endpoint|route|request|response/i.test(question),
      hasDatabase: /database|query|sql|model|schema/i.test(question),
      hasTest: /test|spec|coverage|quality/i.test(question),
      hasDocumentation: /document|readme|comment|explain/i.test(question)
    };
  }

  scoreAgentRelevance(agent, analysis) {
    let score = 0;

    if (agent.name.includes('Security') && analysis.hasSecurity) score += 0.9;
    if (agent.name.includes('Architecture') && analysis.hasArchitecture) score += 0.9;
    if (agent.name.includes('API') && analysis.hasAPI) score += 0.9;
    if (agent.name.includes('Database') && analysis.hasDatabase) score += 0.9;
    if (agent.name.includes('Test') && analysis.hasTest) score += 0.9;
    if (agent.name.includes('Documentation') && analysis.hasDocumentation) score += 0.9;

    // Base relevance for all agents
    score += 0.2;

    return Math.min(1, score);
  }

  calculateConsistency(result, allResults) {
    // How consistent is this result with others?
    const others = allResults.filter(r => r.agent !== result.agent);

    if (others.length === 0) return 1;

    const agreements = others.filter(other => {
      // Simple consistency check based on confidence similarity
      return Math.abs(result.confidence - other.confidence) < 0.3;
    });

    return agreements.length / others.length;
  }

  findContradictions(findings1, findings2) {
    // Simple contradiction detection
    // In production, use NLP similarity

    for (const f1 of findings1) {
      for (const f2 of findings2) {
        if (this.areContradictory(f1, f2)) {
          return { finding1: f1, finding2: f2 };
        }
      }
    }

    return null;
  }

  areContradictory(finding1, finding2) {
    // Check for negation patterns
    const str1 = String(finding1).toLowerCase();
    const str2 = String(finding2).toLowerCase();

    if (str1.includes('secure') && str2.includes('insecure')) return true;
    if (str1.includes('safe') && str2.includes('unsafe')) return true;
    if (str1.includes('no') && !str2.includes('no')) return true;

    return false;
  }

  parseInsights(response) {
    try {
      return JSON.parse(response);
    } catch {
      return {
        analysis: response,
        confidence: 0.7,
        findings: []
      };
    }
  }

  deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(s => {
      const key = `${s.file}:${s.agent}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  updatePerformance(agents, synthesis) {
    agents.forEach(agent => {
      const perf = this.agentPerformance.get(agent.name);
      perf.queries++;

      if (synthesis.confidence > 0.7) {
        perf.successes++;
      }

      // Update rolling average confidence
      perf.avgConfidence =
        (perf.avgConfidence * (perf.queries - 1) + synthesis.confidence) /
        perf.queries;
    });
  }

  initializeAgents() {
    return [
      SecurityAgent,
      ArchitectureAgent,
      APIAgent,
      DatabaseAgent,
      TestAgent,
      DocumentationAgent
    ];
  }

  getPerformanceStats() {
    const stats = {};

    for (const [name, perf] of this.agentPerformance) {
      stats[name] = {
        queries: perf.queries,
        successRate: perf.queries > 0 ? (perf.successes / perf.queries) : 0,
        avgConfidence: perf.avgConfidence
      };
    }

    return stats;
  }
}

// Factory function
export function createMultiAgentOrchestrator(options) {
  return new MultiAgentOrchestrator(options);
}

export default MultiAgentOrchestrator;
