/**
 * RAG AGENT SYSTEM
 *
 * Specialized agents for different code analysis tasks
 */

export class RAGAgent {
  constructor(name, capabilities, retrievalStrategy) {
    this.name = name;
    this.capabilities = capabilities;
    this.retrievalStrategy = retrievalStrategy;
  }

  async retrieve(question, vectorDB, options = {}) {
    return await this.retrievalStrategy(question, vectorDB, options);
  }

  canHandle(questionType) {
    return this.capabilities.some(cap => questionType.includes(cap));
  }
}

/**
 * Security Agent - Focuses on security vulnerabilities
 */
export const SecurityAgent = new RAGAgent(
  'Security Analyzer',
  ['security', 'vulnerability', 'exploit', 'attack'],
  async (question, vectorDB, options) => {
    // Retrieve security-focused code
    const securityKeywords = ['auth', 'password', 'token', 'encrypt', 'validate', 'sanitize'];
    const query = `${question} ${securityKeywords.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { tags: { $in: ['security', 'auth', 'crypto'] } }
    });
  }
);

/**
 * Architecture Agent - Focuses on code structure and design
 */
export const ArchitectureAgent = new RAGAgent(
  'Architecture Analyzer',
  ['architecture', 'design', 'pattern', 'structure'],
  async (question, vectorDB, options) => {
    // Retrieve architectural components
    const archKeywords = ['class', 'interface', 'module', 'component', 'service'];
    const query = `${question} ${archKeywords.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { type: { $in: ['class', 'interface', 'module'] } }
    });
  }
);

/**
 * API Agent - Focuses on API endpoints and integrations
 */
export const APIAgent = new RAGAgent(
  'API Analyzer',
  ['api', 'endpoint', 'route', 'request', 'response'],
  async (question, vectorDB, options) => {
    // Retrieve API-related code
    const apiPatterns = ['router', 'controller', 'endpoint', 'middleware'];
    const query = `${question} ${apiPatterns.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { path: { $regex: '(routes|controllers|api)' } }
    });
  }
);

/**
 * Database Agent - Focuses on data layer
 */
export const DatabaseAgent = new RAGAgent(
  'Database Analyzer',
  ['database', 'sql', 'query', 'orm', 'model'],
  async (question, vectorDB, options) => {
    // Retrieve database-related code
    const dbKeywords = ['query', 'model', 'schema', 'migration', 'repository'];
    const query = `${question} ${dbKeywords.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { path: { $regex: '(models|repositories|database)' } }
    });
  }
);

/**
 * Test Agent - Focuses on tests and quality assurance
 */
export const TestAgent = new RAGAgent(
  'Test Analyzer',
  ['test', 'testing', 'spec', 'coverage', 'qa'],
  async (question, vectorDB, options) => {
    // Retrieve test files
    const testKeywords = ['test', 'spec', 'expect', 'assert', 'mock'];
    const query = `${question} ${testKeywords.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { path: { $regex: '(test|spec|__tests__)' } }
    });
  }
);

/**
 * Documentation Agent - Focuses on comments and documentation
 */
export const DocumentationAgent = new RAGAgent(
  'Documentation Analyzer',
  ['documentation', 'comment', 'readme', 'guide', 'how-to'],
  async (question, vectorDB, options) => {
    // Retrieve documentation
    const docKeywords = ['readme', 'doc', 'guide', 'tutorial'];
    const query = `${question} ${docKeywords.join(' ')}`;
    const embedding = await generateEmbedding(query);

    return await vectorDB.query('code', embedding, options.topK, {
      metadata: { type: { $in: ['documentation', 'comment', 'readme'] } }
    });
  }
);

// All available agents
export const ALL_AGENTS = [
  SecurityAgent,
  ArchitectureAgent,
  APIAgent,
  DatabaseAgent,
  TestAgent,
  DocumentationAgent
];

/**
 * Agent Orchestrator
 */
export class AgentOrchestrator {
  constructor(agents = ALL_AGENTS) {
    this.agents = agents;
  }

  selectAgents(questionType) {
    const selected = this.agents.filter(agent => agent.canHandle(questionType));

    // Always include at least one agent
    if (selected.length === 0) {
      selected.push(this.agents[0]);
    }

    return selected;
  }

  async runAgents(agents, question, vectorDB, options = {}) {
    const results = await Promise.all(
      agents.map(async (agent) => {
        const retrieved = await agent.retrieve(question, vectorDB, options);
        return {
          agent: agent.name,
          results: retrieved
        };
      })
    );

    return results;
  }

  async synthesize(agentResults, question, llm) {
    // Combine results from all agents
    const allRetrieved = agentResults.flatMap(ar => ar.results);

    // Deduplicate by ID
    const unique = new Map();
    allRetrieved.forEach(r => unique.set(r.id, r));
    const deduplicated = Array.from(unique.values());

    // Re-rank by relevance
    const reranked = deduplicated.sort((a, b) => b.score - a.score);

    // Build context
    const context = reranked
      .slice(0, 10)
      .map(r => `[${r.metadata.file}]\n${r.metadata.content}`)
      .join('\n\n');

    // Generate answer
    const answer = await llm.chat([
      { role: 'system', content: 'Synthesize information from multiple specialized agents.' },
      { role: 'user', content: `Context from agents:\n${context}\n\nQuestion: ${question}\n\nAnswer:` }
    ], { temperature: 0.7, maxTokens: 1000 });

    return {
      answer,
      sources: deduplicated.slice(0, 10),
      agentContributions: agentResults.map(ar => ({
        agent: ar.agent,
        resultsCount: ar.results.length
      }))
    };
  }
}

// Helper function
async function generateEmbedding(_text) {
  // This would use the actual embedding service
  // For now, placeholder
  return new Array(768).fill(0).map(() => Math.random());
}

export default AgentOrchestrator;
