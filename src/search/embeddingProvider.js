import axios from 'axios';

/**
 * Embedding Provider - Generates embeddings for semantic search
 * Supports multiple backends: OpenAI, HuggingFace, TF-IDF fallback
 */
export class EmbeddingProvider {
  constructor(options = {}) {
    this.options = {
      provider: options.provider || 'openai',
      model: options.embeddingModel || 'text-embedding-ada-002',
      dimensions: options.dimensions || 1536,
      ...options
    };
    this.initialized = false;
  }

  static async create(provider = 'openai', options = {}) {
    const instance = new EmbeddingProvider({ provider, ...options });
    await instance.initialize();
    return instance;
  }

  async initialize() {
    switch (this.options.provider) {
      case 'openai':
        await this.initializeOpenAI();
        break;
      case 'huggingface':
        await this.initializeHuggingFace();
        break;
      case 'local':
        await this.initializeLocal();
        break;
      case 'tfidf':
      default:
        this.initializeTFIDF();
        break;
    }
    this.initialized = true;
  }

  async initializeOpenAI() {
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      console.warn('OpenAI API key not found, falling back to TF-IDF');
      this.options.provider = 'tfidf';
      this.initializeTFIDF();
    }
  }

  async initializeHuggingFace() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!this.apiKey) {
      console.warn('HuggingFace API key not found, falling back to TF-IDF');
      this.options.provider = 'tfidf';
      this.initializeTFIDF();
    }
  }

  async initializeLocal() {
    // Try to load a local model (sentence-transformers)
    try {
      this.localModel = await import('sentence-transformers').catch(() => null);
      if (this.localModel) {
        this.localPipeline = await this.localModel.pipeline('feature-extraction', 'all-MiniLM-L6-v2');
      }
    } catch (e) {
      console.warn('Local model not available, falling back to TF-IDF');
    }
    this.initializeTFIDF();
  }

  initializeTFIDF() {
    this.vocabulary = new Map();
    this.documentFrequency = new Map();
    this.totalDocuments = 0;
    this.dimension = 384; // Standard TF-IDF vector size
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      return this.getZeroVector();
    }

    switch (this.options.provider) {
      case 'openai':
        return await this.getOpenAIEmbedding(text);
      case 'huggingface':
        return await this.getHuggingFaceEmbedding(text);
      case 'local':
        return await this.getLocalEmbedding(text);
      case 'tfidf':
      default:
        return this.getTFIDFEmbedding(text);
    }
  }

  /**
   * Get OpenAI embedding
   */
  async getOpenAIEmbedding(text) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: this.options.model,
          input: text
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      console.warn('OpenAI embedding failed, using TF-IDF fallback:', error.message);
      return this.getTFIDFEmbedding(text);
    }
  }

  /**
   * Get HuggingFace embedding
   */
  async getHuggingFaceEmbedding(text) {
    try {
      const response = await axios.post(
        'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.warn('HuggingFace embedding failed, using TF-IDF fallback:', error.message);
      return this.getTFIDFEmbedding(text);
    }
  }

  /**
   * Get local model embedding
   */
  async getLocalEmbedding(text) {
    if (this.localPipeline) {
      const output = await this.localPipeline(text, {
        pooling: 'mean',
        normalize: true
      });
      return Array.from(output);
    }
    return this.getTFIDFEmbedding(text);
  }

  /**
   * TF-IDF based embedding (fallback)
   * Creates a simple hash-based vector representation
   */
  getTFIDFEmbedding(text) {
    const vector = new Array(this.dimension).fill(0);
    const tokens = this.tokenize(text);

    // Use hash to distribute tokens across vector dimensions
    for (const token of tokens) {
      const hash = this.hashString(token);
      const index = hash % this.dimension;
      vector[index] += 1;
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Tokenize text into words
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  /**
   * Hash string to number
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get zero vector
   */
  getZeroVector() {
    return new Array(this.dimension).fill(0);
  }

  /**
   * Get embedding dimensions
   */
  getDimensions() {
    return this.dimension;
  }
}

export default EmbeddingProvider;
