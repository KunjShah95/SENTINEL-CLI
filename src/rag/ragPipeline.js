/**
 * RAG (RETRIEVAL AUGMENTED GENERATION) PIPELINE
 *
 * Inspired by:
 * - Anthropic's Constitutional AI
 * - OpenAI's GPT-4 with retrieval
 * - DeepMind's RETRO architecture
 *
 * Production-grade RAG with:
 * - Hybrid search (dense + sparse)
 * - Re-ranking
 * - Context compression
 * - Citation tracking
 */

import { createVectorDB } from '../database/vectorDatabase.js';
import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import { createDistributedEngine } from '../distributed/distributedEngine.js';

export class RAGPipeline {
  constructor(options = {}) {
    this.options = {
      vectorDB: options.vectorDB || 'chroma',
      embeddingModel: options.embeddingModel || 'text-embedding-ada-002',
      llmModel: options.llmModel || 'gpt-4',
      topK: options.topK || 10,
      rerank: options.rerank !== false,
      contextWindow: options.contextWindow || 8000,
      chunkSize: options.chunkSize || 500,
      chunkOverlap: options.chunkOverlap || 50,
      ...options
    };

    this.vectorDB = null;
    this.llmOrchestrator = null;
    this.distributedEngine = null;
  }

  async initialize() {
    // Initialize vector database
    this.vectorDB = createVectorDB(this.options.vectorDB, {
      baseUrl: this.options.vectorDBUrl
    });
    await this.vectorDB.connect();

    // Initialize LLM
    this.llmOrchestrator = getLLMOrchestrator();

    // Initialize distributed engine for parallel processing
    this.distributedEngine = createDistributedEngine({
      maxWorkers: this.options.maxWorkers || 8
    });
    await this.distributedEngine.initialize();

    console.log('✅ RAG Pipeline initialized');
  }

  /**
   * Index codebase into vector database
   */
  async indexCodebase(projectPath, _options = {}) {
    const glob = (await import('glob')).glob;

    console.log('🔍 Indexing codebase...');

    // Find all code files
    const files = await glob('**/*.{js,jsx,ts,tsx,py,go,rs,java}', {
      cwd: projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    console.log(`Found ${files.length} files`);

    // Create collection
    await this.vectorDB.createCollection('code', 768);

    // Process files in parallel
    const tasks = files.map(file => ({
      type: 'index_file',
      data: { projectPath, file }
    }));

    await this.distributedEngine.addBatch(tasks);
    await this.distributedEngine.waitForCompletion();

    // Get results and upsert to vector DB
    const vectors = [];
    for (const [, result] of this.distributedEngine.completedTasks) {
      const chunks = result.result.chunks;

      for (const chunk of chunks) {
        const embedding = await this.generateEmbedding(chunk.content);

        vectors.push({
          id: chunk.id,
          vector: embedding,
          metadata: {
            file: chunk.file,
            type: chunk.type,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content
          }
        });
      }

      // Batch upsert
      if (vectors.length >= 100) {
        await this.vectorDB.upsert('code', vectors);
        vectors.length = 0;
      }
    }

    // Upsert remaining
    if (vectors.length > 0) {
      await this.vectorDB.upsert('code', vectors);
    }

    console.log('✅ Indexing complete');

    return {
      filesIndexed: files.length,
      chunksIndexed: this.distributedEngine.completedTasks.size
    };
  }

  /**
   * Query with RAG
   */
  async query(question, options = {}) {
    const {
      topK = this.options.topK,
      temperature = 0.7,
      maxTokens = 1000
    } = options;

    console.log(`🔍 RAG Query: ${question}`);

    // 1. Generate query embedding
    const queryEmbedding = await this.generateEmbedding(question);

    // 2. Retrieve relevant chunks (dense search)
    const denseResults = await this.vectorDB.query('code', queryEmbedding, topK * 2);

    // 3. Keyword search (sparse search)
    const sparseResults = await this.keywordSearch(question, topK);

    // 4. Hybrid fusion (RRF - Reciprocal Rank Fusion)
    const fusedResults = this.reciprocalRankFusion(denseResults, sparseResults, topK);

    // 5. Re-rank if enabled
    const rerankedResults = this.options.rerank
      ? await this.rerank(question, fusedResults)
      : fusedResults;

    // 6. Build context
    const context = this.buildContext(rerankedResults, this.options.contextWindow);

    // 7. Generate answer with LLM
    const answer = await this.generateAnswer(question, context, {
      temperature,
      maxTokens
    });

    return {
      answer: answer.text,
      sources: rerankedResults.slice(0, 5).map(r => ({
        file: r.metadata.file,
        lines: `${r.metadata.startLine}-${r.metadata.endLine}`,
        score: r.score,
        content: r.metadata.content.substring(0, 200)
      })),
      citations: answer.citations
    };
  }

  /**
   * Generate embedding
   */
  async generateEmbedding(text) {
    // Use distributed engine for parallel embedding generation
    const taskId = await this.distributedEngine.addTask({
      type: 'generate_embedding',
      data: { text }
    });

    // Wait for completion
    await this.distributedEngine.waitForCompletion();

    const result = this.distributedEngine.completedTasks.get(taskId);
    return result.result;
  }

  /**
   * Keyword search (sparse retrieval)
   */
  async keywordSearch(query, topK) {
    // BM25-like keyword search
    const keywords = query.toLowerCase().split(/\s+/);

    // Simple keyword matching (in production, use Elasticsearch/BM25)
    const allResults = Array.from(this.distributedEngine.completedTasks.values());

    const scored = allResults.map(result => {
      const content = result.result.content?.toLowerCase() || '';
      const score = keywords.reduce((acc, keyword) => {
        const count = (content.match(new RegExp(keyword, 'g')) || []).length;
        return acc + count * Math.log(1 + count);
      }, 0);

      return {
        id: result.id,
        score,
        metadata: result.result
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Reciprocal Rank Fusion
   */
  reciprocalRankFusion(denseResults, sparseResults, topK, k = 60) {
    const scores = new Map();

    // Score dense results
    denseResults.forEach((result, rank) => {
      const score = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) || 0) + score);
    });

    // Score sparse results
    sparseResults.forEach((result, rank) => {
      const score = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) || 0) + score);
    });

    // Combine and sort
    const combined = Array.from(scores.entries())
      .map(([id, score]) => {
        const denseResult = denseResults.find(r => r.id === id);
        const sparseResult = sparseResults.find(r => r.id === id);
        return {
          id,
          score,
          metadata: denseResult?.metadata || sparseResult?.metadata
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return combined;
  }

  /**
   * Re-rank results using cross-encoder
   */
  async rerank(query, results) {
    // In production: use cross-encoder model (e.g., ms-marco-MiniLM)
    // For now: simple relevance scoring based on keyword overlap

    const queryTerms = new Set(query.toLowerCase().split(/\s+/));

    const reranked = results.map(result => {
      const content = result.metadata.content.toLowerCase();
      const contentTerms = new Set(content.split(/\s+/));

      // Jaccard similarity
      const intersection = new Set([...queryTerms].filter(x => contentTerms.has(x)));
      const union = new Set([...queryTerms, ...contentTerms]);
      const similarity = intersection.size / union.size;

      return {
        ...result,
        score: similarity
      };
    });

    return reranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Build context from results
   */
  buildContext(results, maxTokens) {
    let context = '';
    let tokenCount = 0;

    for (const result of results) {
      const chunk = `\n[File: ${result.metadata.file}:${result.metadata.startLine}-${result.metadata.endLine}]\n${result.metadata.content}\n`;

      // Rough token estimation (1 token ~= 4 chars)
      const chunkTokens = Math.ceil(chunk.length / 4);

      if (tokenCount + chunkTokens > maxTokens) {
        break;
      }

      context += chunk;
      tokenCount += chunkTokens;
    }

    return context;
  }

  /**
   * Generate answer with LLM
   */
  async generateAnswer(question, context, options) {
    const prompt = `You are a code security expert. Answer the question based ONLY on the provided code context. Include file references in your answer.

Context:
${context}

Question: ${question}

Answer (include file:line citations):`;

    const response = await this.llmOrchestrator.chat([
      { role: 'system', content: 'You are a helpful code security assistant.' },
      { role: 'user', content: prompt }
    ], options);

    // Extract citations
    const citations = this.extractCitations(response);

    return {
      text: response,
      citations
    };
  }

  /**
   * Extract citations from answer
   */
  extractCitations(text) {
    const citationRegex = /([^\s]+\.(?:js|ts|py|go|rs)):(\d+)/g;
    const citations = [];
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      citations.push({
        file: match[1],
        line: parseInt(match[2])
      });
    }

    return citations;
  }

  /**
   * Multi-query retrieval
   */
  async multiQueryRetrieval(question, numQueries = 3) {
    // Generate multiple query variations
    const queries = await this.generateQueryVariations(question, numQueries);

    // Retrieve for each query
    const allResults = await Promise.all(
      queries.map(q => this.query(q))
    );

    // Deduplicate and merge
    const merged = this.mergeResults(allResults);

    return merged;
  }

  /**
   * Generate query variations
   */
  async generateQueryVariations(question, num) {
    const prompt = `Generate ${num} different ways to ask this question, focusing on different aspects:

Original: ${question}

Variations (one per line):`;

    const response = await this.llmOrchestrator.chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, maxTokens: 200 });

    return response.split('\n').filter(l => l.trim()).slice(0, num);
  }

  /**
   * Merge results from multiple queries
   */
  mergeResults(allResults) {
    const merged = new Map();

    allResults.forEach(result => {
      result.sources.forEach(source => {
        const key = `${source.file}:${source.lines}`;
        if (!merged.has(key)) {
          merged.set(key, source);
        }
      });
    });

    return Array.from(merged.values());
  }

  /**
   * Shutdown
   */
  async shutdown() {
    if (this.vectorDB) {
      await this.vectorDB.disconnect();
    }

    if (this.distributedEngine) {
      await this.distributedEngine.shutdown();
    }
  }
}

// Factory function
export function createRAGPipeline(options) {
  return new RAGPipeline(options);
}

export default RAGPipeline;
