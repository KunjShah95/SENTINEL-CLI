import { promises as fs } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import crypto from 'crypto';

/**
 * Semantic Code Search - Natural language code search using embeddings
 */
export class SemanticCodeSearch {
  constructor(projectPath = process.cwd(), options = {}) {
    this.projectPath = projectPath;
    this.options = {
      provider: options.provider || 'openai',
      embeddingModel: options.embeddingModel || 'text-embedding-ada-002',
      cacheEmbeddings: options.cacheEmbeddings !== false,
      maxResults: options.maxResults || 20,
      similarityThreshold: options.similarityThreshold || 0.7,
      ...options
    };

    this.embeddingCache = new Map();
    this.codeChunks = [];
  }

  /**
   * Index codebase for semantic search
   */
  async indexCodebase(options = {}) {
    const {
      includePatterns = ['**/*.{js,jsx,ts,tsx,py,go,rs,java}'],
      excludePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
    } = options;

    console.log('Indexing codebase for semantic search...');

    // Find all files
    const files = await glob(includePatterns, {
      cwd: this.projectPath,
      ignore: excludePatterns,
      nodir: true
    });

    console.log(`Found ${files.length} files to index`);

    // Process each file
    for (const file of files) {
      const chunks = await this.processFile(file);
      this.codeChunks.push(...chunks);
    }

    // Generate embeddings
    console.log(`Generating embeddings for ${this.codeChunks.length} code chunks...`);
    await this.generateEmbeddings();

    console.log('✓ Indexing complete');

    return {
      filesIndexed: files.length,
      chunksIndexed: this.codeChunks.length
    };
  }

  /**
   * Process file into searchable chunks
   */
  async processFile(file) {
    const filePath = join(this.projectPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = [];

    // Split into logical chunks (functions, classes, etc.)
    const logicalChunks = this.splitIntoLogicalChunks(content, file);

    for (const chunk of logicalChunks) {
      chunks.push({
        file,
        content: chunk.content,
        type: chunk.type,
        name: chunk.name,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        hash: this.hashContent(chunk.content)
      });
    }

    return chunks;
  }

  /**
   * Split code into logical chunks
   */
  splitIntoLogicalChunks(content, _file) {
    const chunks = [];
    const lines = content.split('\n');

    // Simple chunking by functions/classes for JS/TS
    let currentChunk = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect function/class start
      if (/^(export\s+)?(async\s+)?function\s+\w+|^class\s+\w+|^export\s+class\s+\w+/.test(line.trim())) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        const match = line.match(/(?:function|class)\s+(\w+)/);
        currentChunk = {
          type: line.includes('class') ? 'class' : 'function',
          name: match ? match[1] : 'anonymous',
          content: line + '\n',
          startLine: i + 1,
          endLine: i + 1
        };
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      if (currentChunk) {
        currentChunk.content += line + '\n';
        currentChunk.endLine = i + 1;
        braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        if (braceCount === 0 && line.includes('}')) {
          chunks.push(currentChunk);
          currentChunk = null;
        }
      }
    }

    // If no logical chunks found, create fixed-size chunks
    if (chunks.length === 0) {
      const chunkSize = 50; // lines
      for (let i = 0; i < lines.length; i += chunkSize) {
        chunks.push({
          type: 'block',
          name: `lines-${i + 1}-${Math.min(i + chunkSize, lines.length)}`,
          content: lines.slice(i, i + chunkSize).join('\n'),
          startLine: i + 1,
          endLine: Math.min(i + chunkSize, lines.length)
        });
      }
    }

    return chunks;
  }

  /**
   * Generate embeddings for all chunks
   */
  async generateEmbeddings() {
    const orchestrator = getLLMOrchestrator();

    for (const chunk of this.codeChunks) {
      // Check cache
      if (this.options.cacheEmbeddings && this.embeddingCache.has(chunk.hash)) {
        chunk.embedding = this.embeddingCache.get(chunk.hash);
        continue;
      }

      // Generate embedding
      try {
        const text = this.prepareTextForEmbedding(chunk);
        const embedding = await this.getEmbedding(text, orchestrator);

        chunk.embedding = embedding;

        if (this.options.cacheEmbeddings) {
          this.embeddingCache.set(chunk.hash, embedding);
        }
      } catch (error) {
        console.warn(`Failed to generate embedding for ${chunk.file}:${chunk.startLine}: ${error.message}`);
      }
    }
  }

  /**
   * Prepare text for embedding
   */
  prepareTextForEmbedding(chunk) {
    // Include context: file path, type, name, and code
    return `File: ${chunk.file}
Type: ${chunk.type}
Name: ${chunk.name}
Code:
${chunk.content}`;
  }

  /**
   * Get embedding from LLM
   */
  async getEmbedding(text, _orchestrator) {
    // Simplified - in production, use actual embedding API
    // For now, return a simple hash-based vector
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector = Array.from(hash.slice(0, 32), byte => byte / 255);
    return vector;

    /* In production with OpenAI:
    const response = await orchestrator.embeddings(text, {
      provider: this.options.provider,
      model: this.options.embeddingModel
    });
    return response.embedding;
    */
  }

  /**
   * Search codebase with natural language query
   */
  async search(query, options = {}) {
    const {
      maxResults = this.options.maxResults,
      similarityThreshold = this.options.similarityThreshold,
      fileFilter = null,
      typeFilter = null
    } = options;

    // Generate embedding for query
    const orchestrator = getLLMOrchestrator();
    const queryEmbedding = await this.getEmbedding(query, orchestrator);

    // Calculate similarity with all chunks
    let results = this.codeChunks.map(chunk => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return {
        ...chunk,
        similarity,
        score: similarity
      };
    });

    // Filter by similarity threshold
    results = results.filter(r => r.similarity >= similarityThreshold);

    // Apply filters
    if (fileFilter) {
      results = results.filter(r => r.file.includes(fileFilter));
    }

    if (typeFilter) {
      results = results.filter(r => r.type === typeFilter);
    }

    // Sort by similarity
    results.sort((a, b) => b.similarity - a.similarity);

    // Limit results
    results = results.slice(0, maxResults);

    return results;
  }

  /**
   * Ask a question about the codebase
   */
  async ask(question, options = {}) {
    // Search for relevant code
    const results = await this.search(question, {
      maxResults: 5,
      ...options
    });

    if (results.length === 0) {
      return {
        answer: 'I could not find relevant code for your question.',
        sources: []
      };
    }

    // Use LLM to generate answer based on search results
    const orchestrator = getLLMOrchestrator();

    const context = results.map((r, i) => `
[Source ${i + 1}: ${r.file}:${r.startLine}-${r.endLine}]
${r.content}
`).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: 'You are a code expert. Answer questions about the codebase based on the provided context. Be specific and reference line numbers when appropriate.'
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nRelevant code:\n${context}\n\nAnswer the question based on this code.`
      }
    ];

    try {
      const answer = await orchestrator.chat(messages, {
        provider: this.options.provider,
        temperature: 0.3,
        maxTokens: 500
      });

      return {
        answer,
        sources: results.map(r => ({
          file: r.file,
          lines: `${r.startLine}-${r.endLine}`,
          type: r.type,
          name: r.name,
          similarity: r.similarity
        }))
      };
    } catch (error) {
      return {
        answer: `Error generating answer: ${error.message}`,
        sources: results.map(r => ({
          file: r.file,
          lines: `${r.startLine}-${r.endLine}`
        }))
      };
    }
  }

  /**
   * Find similar code
   */
  async findSimilar(codeSnippet, options = {}) {
    const {
      maxResults = 10,
      excludeExact = true
    } = options;

    // Generate embedding for code snippet
    const orchestrator = getLLMOrchestrator();
    const snippetEmbedding = await this.getEmbedding(codeSnippet, orchestrator);

    // Calculate similarity
    let results = this.codeChunks.map(chunk => {
      const similarity = this.cosineSimilarity(snippetEmbedding, chunk.embedding);
      return {
        ...chunk,
        similarity
      };
    });

    // Exclude exact matches if requested
    if (excludeExact) {
      const snippetHash = this.hashContent(codeSnippet);
      results = results.filter(r => r.hash !== snippetHash);
    }

    // Sort and limit
    results.sort((a, b) => b.similarity - a.similarity);
    results = results.slice(0, maxResults);

    return results;
  }

  /**
   * Calculate cosine similarity
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Hash content
   */
  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Save index to file
   */
  async saveIndex(filepath) {
    const data = {
      projectPath: this.projectPath,
      indexedAt: new Date().toISOString(),
      chunks: this.codeChunks,
      embeddingCache: Array.from(this.embeddingCache.entries())
    };

    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  /**
   * Load index from file
   */
  async loadIndex(filepath) {
    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    this.projectPath = data.projectPath;
    this.codeChunks = data.chunks;
    this.embeddingCache = new Map(data.embeddingCache);

    return {
      loaded: true,
      chunks: this.codeChunks.length
    };
  }

  /**
   * Clear index
   */
  clearIndex() {
    this.codeChunks = [];
    this.embeddingCache.clear();
  }
}

// Factory function
export function createSemanticSearch(projectPath, options) {
  return new SemanticCodeSearch(projectPath, options);
}

export default SemanticCodeSearch;
