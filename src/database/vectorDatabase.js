/**
 * VECTOR DATABASE INTEGRATION
 *
 * Inspired by Anthropic's retrieval systems and DeepMind's code understanding
 *
 * Supports:
 * - Pinecone (managed, scalable)
 * - Weaviate (open-source, graph-based)
 * - Chroma (lightweight, local-first)
 * - Qdrant (high-performance)
 */

import axios from 'axios';
import crypto from 'crypto';

export class VectorDatabase {
  constructor(provider = 'chroma', options = {}) {
    this.provider = provider;
    this.options = options;
    this.client = null;
    this.cache = new Map();

    this.providers = {
      pinecone: new PineconeAdapter(options),
      weaviate: new WeaviateAdapter(options),
      chroma: new ChromaAdapter(options),
      qdrant: new QdrantAdapter(options)
    };
  }

  async connect() {
    this.client = this.providers[this.provider];
    await this.client.connect();
    console.log(`✅ Connected to ${this.provider} vector database`);
  }

  async createCollection(name, dimension = 768) {
    return await this.client.createCollection(name, dimension);
  }

  async upsert(collection, vectors) {
    return await this.client.upsert(collection, vectors);
  }

  async query(collection, vector, topK = 10, filter = null) {
    // Check cache
    const cacheKey = this.getCacheKey(collection, vector, topK, filter);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.client.query(collection, vector, topK, filter);

    // Cache results
    this.cache.set(cacheKey, results);

    return results;
  }

  async delete(collection, ids) {
    return await this.client.delete(collection, ids);
  }

  getCacheKey(collection, vector, topK, filter) {
    const key = `${collection}:${this.hashVector(vector)}:${topK}:${JSON.stringify(filter)}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  hashVector(vector) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(vector))
      .digest('hex')
      .substring(0, 16);
  }

  clearCache() {
    this.cache.clear();
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }
}

/**
 * Pinecone Adapter - Managed vector database
 */
class PineconeAdapter {
  constructor(options) {
    this.apiKey = options.apiKey || process.env.PINECONE_API_KEY;
    this.environment = options.environment || 'us-west1-gcp';
    this.baseUrl = `https://controller.${this.environment}.pinecone.io`;
  }

  async connect() {
    // Verify API key
    if (!this.apiKey) {
      throw new Error('Pinecone API key required');
    }
  }

  async createCollection(name, dimension) {
    await axios.post(
      `${this.baseUrl}/databases`,
      {
        name,
        dimension,
        metric: 'cosine',
        pods: 1,
        replicas: 1,
        pod_type: 'p1.x1'
      },
      {
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return { name, dimension };
  }

  async upsert(collection, vectors) {
    const index = await this.getIndex(collection);

    await axios.post(
      `${index.url}/vectors/upsert`,
      {
        vectors: vectors.map(v => ({
          id: v.id,
          values: v.vector,
          metadata: v.metadata
        }))
      },
      {
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return { upserted: vectors.length };
  }

  async query(collection, vector, topK, filter) {
    const index = await this.getIndex(collection);

    const response = await axios.post(
      `${index.url}/query`,
      {
        vector,
        topK,
        filter,
        includeMetadata: true
      },
      {
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.matches.map(m => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata
    }));
  }

  async delete(collection, ids) {
    const index = await this.getIndex(collection);

    await axios.post(
      `${index.url}/vectors/delete`,
      { ids },
      {
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    return { deleted: ids.length };
  }

  async getIndex(collection) {
    const response = await axios.get(
      `${this.baseUrl}/databases/${collection}`,
      {
        headers: { 'Api-Key': this.apiKey }
      }
    );

    return response.data.database;
  }

  async disconnect() {
    // No persistent connection to close
  }
}

/**
 * Chroma Adapter - Local-first vector database
 */
class ChromaAdapter {
  constructor(options) {
    this.baseUrl = options.baseUrl || 'http://localhost:8000';
  }

  async connect() {
    try {
      await axios.get(`${this.baseUrl}/api/v1/heartbeat`);
    } catch (error) {
      throw new Error('Chroma server not running. Start with: docker run -p 8000:8000 chromadb/chroma');
    }
  }

  async createCollection(name, dimension) {
    await axios.post(`${this.baseUrl}/api/v1/collections`, {
      name,
      metadata: { dimension }
    });

    return { name, dimension };
  }

  async upsert(collection, vectors) {
    await axios.post(
      `${this.baseUrl}/api/v1/collections/${collection}/upsert`,
      {
        ids: vectors.map(v => v.id),
        embeddings: vectors.map(v => v.vector),
        metadatas: vectors.map(v => v.metadata)
      }
    );

    return { upserted: vectors.length };
  }

  async query(collection, vector, topK, filter) {
    const response = await axios.post(
      `${this.baseUrl}/api/v1/collections/${collection}/query`,
      {
        query_embeddings: [vector],
        n_results: topK,
        where: filter
      }
    );

    const results = response.data;

    return results.ids[0].map((id, i) => ({
      id,
      score: results.distances[0][i],
      metadata: results.metadatas[0][i]
    }));
  }

  async delete(collection, ids) {
    await axios.post(
      `${this.baseUrl}/api/v1/collections/${collection}/delete`,
      { ids }
    );

    return { deleted: ids.length };
  }

  async disconnect() {
    // No persistent connection
  }
}

/**
 * Weaviate Adapter - Graph-based vector database
 */
class WeaviateAdapter {
  constructor(options) {
    this.baseUrl = options.baseUrl || 'http://localhost:8080';
    this.apiKey = options.apiKey;
  }

  async connect() {
    try {
      await axios.get(`${this.baseUrl}/v1/.well-known/ready`);
    } catch (error) {
      throw new Error('Weaviate server not running');
    }
  }

  async createCollection(name, dimension) {
    const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

    await axios.post(
      `${this.baseUrl}/v1/schema`,
      {
        class: name,
        vectorizer: 'none',
        properties: [
          { name: 'content', dataType: ['text'] },
          { name: 'metadata', dataType: ['object'] }
        ]
      },
      { headers }
    );

    return { name, dimension };
  }

  async upsert(collection, vectors) {
    const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

    const batch = {
      objects: vectors.map(v => ({
        class: collection,
        id: v.id,
        vector: v.vector,
        properties: v.metadata
      }))
    };

    await axios.post(
      `${this.baseUrl}/v1/batch/objects`,
      batch,
      { headers }
    );

    return { upserted: vectors.length };
  }

  async query(collection, vector, topK, _filter) {
    const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

    const response = await axios.post(
      `${this.baseUrl}/v1/graphql`,
      {
        query: `{
          Get {
            ${collection}(nearVector: { vector: ${JSON.stringify(vector)} }, limit: ${topK}) {
              _additional { id distance }
              content
              metadata
            }
          }
        }`
      },
      { headers }
    );

    return response.data.data.Get[collection].map(item => ({
      id: item._additional.id,
      score: 1 - item._additional.distance,
      metadata: item.metadata
    }));
  }

  async delete(collection, ids) {
    const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

    await Promise.all(
      ids.map(id =>
        axios.delete(`${this.baseUrl}/v1/objects/${collection}/${id}`, { headers })
      )
    );

    return { deleted: ids.length };
  }

  async disconnect() {
    // No persistent connection
  }
}

/**
 * Qdrant Adapter - High-performance vector database
 */
class QdrantAdapter {
  constructor(options) {
    this.baseUrl = options.baseUrl || 'http://localhost:6333';
    this.apiKey = options.apiKey;
  }

  async connect() {
    try {
      await axios.get(`${this.baseUrl}/`);
    } catch (error) {
      throw new Error('Qdrant server not running');
    }
  }

  async createCollection(name, dimension) {
    const headers = this.apiKey ? { 'api-key': this.apiKey } : {};

    await axios.put(
      `${this.baseUrl}/collections/${name}`,
      {
        vectors: {
          size: dimension,
          distance: 'Cosine'
        }
      },
      { headers }
    );

    return { name, dimension };
  }

  async upsert(collection, vectors) {
    const headers = this.apiKey ? { 'api-key': this.apiKey } : {};

    await axios.put(
      `${this.baseUrl}/collections/${collection}/points`,
      {
        points: vectors.map(v => ({
          id: v.id,
          vector: v.vector,
          payload: v.metadata
        }))
      },
      { headers }
    );

    return { upserted: vectors.length };
  }

  async query(collection, vector, topK, filter) {
    const headers = this.apiKey ? { 'api-key': this.apiKey } : {};

    const response = await axios.post(
      `${this.baseUrl}/collections/${collection}/points/search`,
      {
        vector,
        limit: topK,
        filter,
        with_payload: true
      },
      { headers }
    );

    return response.data.result.map(item => ({
      id: item.id,
      score: item.score,
      metadata: item.payload
    }));
  }

  async delete(collection, ids) {
    const headers = this.apiKey ? { 'api-key': this.apiKey } : {};

    await axios.post(
      `${this.baseUrl}/collections/${collection}/points/delete`,
      { points: ids },
      { headers }
    );

    return { deleted: ids.length };
  }

  async disconnect() {
    // No persistent connection
  }
}

// Factory function
export function createVectorDB(provider, options) {
  return new VectorDatabase(provider, options);
}

export default VectorDatabase;
