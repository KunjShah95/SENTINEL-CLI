/**
 * SYNTHETIC DATA GENERATION
 *
 * Generate high-quality training data programmatically
 *
 * Features:
 * - Template-based generation
 * - LLM-powered data augmentation
 * - Back-translation for paraphrasing
 * - Code mutation for variations
 * - Difficulty calibration
 * - Quality filtering
 * - Balanced dataset creation
 *
 * Inspired by:
 * - OpenAI's synthetic data techniques
 * - Google's data augmentation strategies
 * - AlphaCode's test case generation
 */

import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import crypto from 'crypto';

export class SyntheticDataGenerator {
  constructor(options = {}) {
    this.options = {
      targetDatasetSize: options.targetDatasetSize || 1000,
      qualityThreshold: options.qualityThreshold || 0.7,
      diversityThreshold: options.diversityThreshold || 0.5,
      balanceClasses: options.balanceClasses !== false,
      augmentationFactor: options.augmentationFactor || 3,
      ...options
    };

    this.llm = null;

    // Templates for generation
    this.templates = this.initializeTemplates();

    // Generated dataset
    this.syntheticDataset = [];

    // Quality filters
    this.filters = [];
  }

  async initialize() {
    this.llm = getLLMOrchestrator();

    console.log('✅ Synthetic Data Generator initialized');
  }

  /**
   * GENERATE DATASET
   *
   * Main entry point - generate complete synthetic dataset
   */
  async generateDataset(options = {}) {
    const {
      size = this.options.targetDatasetSize,
      categories = ['security', 'architecture', 'api', 'database'],
      difficulties = ['simple', 'moderate', 'complex']
    } = options;

    console.log(`🎨 Generating synthetic dataset (target: ${size} samples)...`);

    const samplesPerCategory = Math.ceil(size / categories.length);

    for (const category of categories) {
      console.log(`\n📋 Generating ${samplesPerCategory} samples for "${category}"...`);

      for (const difficulty of difficulties) {
        const samplesPerDifficulty = Math.ceil(samplesPerCategory / difficulties.length);

        const samples = await this.generateCategorySamples(
          category,
          difficulty,
          samplesPerDifficulty
        );

        this.syntheticDataset.push(...samples);
      }
    }

    // Apply quality filtering
    console.log(`\n🔍 Filtering for quality (threshold: ${this.options.qualityThreshold})...`);
    const filtered = await this.filterByQuality(this.syntheticDataset);

    // Ensure diversity
    console.log(`🎯 Ensuring diversity...`);
    const diverse = this.ensureDiversity(filtered);

    console.log(`✅ Generated ${diverse.length} high-quality diverse samples`);

    return diverse;
  }

  /**
   * GENERATE CATEGORY SAMPLES
   */
  async generateCategorySamples(category, difficulty, count) {
    const samples = [];

    for (let i = 0; i < count; i++) {
      const sample = await this.generateSample(category, difficulty);

      if (sample) {
        samples.push(sample);
      }
    }

    return samples;
  }

  /**
   * GENERATE SINGLE SAMPLE
   */
  async generateSample(category, difficulty) {
    // Select generation method randomly
    const methods = [
      () => this.templateGeneration(category, difficulty),
      () => this.llmGeneration(category, difficulty),
      () => this.mutationGeneration(category, difficulty)
    ];

    const method = methods[Math.floor(Math.random() * methods.length)];

    try {
      const sample = await method();

      // Add metadata
      sample.id = crypto.randomUUID();
      sample.category = category;
      sample.difficulty = difficulty;
      sample.generatedAt = Date.now();
      sample.method = method.name;

      return sample;

    } catch (error) {
      console.warn(`Failed to generate sample: ${error.message}`);
      return null;
    }
  }

  /**
   * TEMPLATE-BASED GENERATION
   */
  async templateGeneration(category, difficulty) {
    const template = this.selectTemplate(category, difficulty);

    if (!template) {
      throw new Error(`No template found for ${category}/${difficulty}`);
    }

    // Fill template slots
    const filled = this.fillTemplate(template);

    return {
      query: filled.query,
      groundTruth: filled.groundTruth,
      features: this.extractFeatures(filled.query)
    };
  }

  selectTemplate(category, difficulty) {
    const categoryTemplates = this.templates[category] || [];
    const suitableTemplates = categoryTemplates.filter(
      t => t.difficulty === difficulty
    );

    if (suitableTemplates.length === 0) {
      return null;
    }

    return suitableTemplates[Math.floor(Math.random() * suitableTemplates.length)];
  }

  fillTemplate(template) {
    let query = template.query;
    let answer = template.answer;

    // Fill slots with entities
    const slots = template.slots || {};

    for (const [slot, options] of Object.entries(slots)) {
      const value = options[Math.floor(Math.random() * options.length)];

      query = query.replace(`{${slot}}`, value);
      answer = answer.replace(`{${slot}}`, value);
    }

    return {
      query,
      groundTruth: {
        answer,
        relevantDocs: template.relevantDocs || [],
        requiredAspects: template.aspects || []
      }
    };
  }

  /**
   * LLM-POWERED GENERATION
   */
  async llmGeneration(category, difficulty) {
    const prompt = this.buildGenerationPrompt(category, difficulty);

    const response = await this.llm.chat([
      {
        role: 'system',
        content: 'You are a security code analysis expert. Generate realistic security questions and answers.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], {
      temperature: 0.8, // Higher temperature for creativity
      maxTokens: 500
    });

    // Parse response
    const parsed = this.parseGeneratedSample(response);

    return {
      query: parsed.query,
      groundTruth: {
        answer: parsed.answer,
        relevantDocs: parsed.relevantDocs || [],
        requiredAspects: parsed.aspects || []
      },
      features: this.extractFeatures(parsed.query)
    };
  }

  buildGenerationPrompt(category, difficulty) {
    const categoryDescriptions = {
      security: 'security vulnerabilities, authentication, authorization, input validation',
      architecture: 'design patterns, code organization, modularity, dependencies',
      api: 'API endpoints, REST routes, request/response handling',
      database: 'database queries, data models, SQL operations'
    };

    const difficultyDescriptions = {
      simple: 'straightforward questions with clear answers',
      moderate: 'questions requiring some analysis and context',
      complex: 'questions requiring deep analysis across multiple files'
    };

    return `Generate a realistic code analysis question about ${categoryDescriptions[category]}.

Difficulty: ${difficultyDescriptions[difficulty]}

Format your response as JSON:
{
  "query": "the question to ask",
  "answer": "the expected answer",
  "relevantDocs": ["file1.js", "file2.js"],
  "aspects": ["key concept 1", "key concept 2"]
}`;
  }

  parseGeneratedSample(response) {
    try {
      // Try to parse as JSON
      return JSON.parse(response);
    } catch {
      // Fallback: extract manually
      return {
        query: response.slice(0, 200),
        answer: response.slice(200, 500),
        relevantDocs: [],
        aspects: []
      };
    }
  }

  /**
   * MUTATION-BASED GENERATION
   *
   * Mutate existing samples to create variations
   */
  async mutationGeneration(category, difficulty) {
    // Start with a template
    const base = await this.templateGeneration(category, difficulty);

    // Apply mutations
    const mutations = [
      (s) => this.paraphraseQuery(s),
      (s) => this.substituteEntities(s),
      (s) => this.addContext(s),
      (s) => this.increaseComplexity(s)
    ];

    // Apply random mutation
    const mutation = mutations[Math.floor(Math.random() * mutations.length)];
    const mutated = await mutation(base);

    return mutated;
  }

  async paraphraseQuery(sample) {
    // Use back-translation for paraphrasing
    const paraphrased = await this.llm.chat([
      {
        role: 'user',
        content: `Rephrase this question while keeping the same meaning: "${sample.query}"`
      }
    ], {
      temperature: 0.7,
      maxTokens: 100
    });

    return {
      ...sample,
      query: paraphrased.trim()
    };
  }

  substituteEntities(sample) {
    // Replace entity names with alternatives
    const entityMappings = {
      'authenticate': ['verify', 'login', 'signin'],
      'User': ['Account', 'Profile', 'Member'],
      'password': ['credential', 'secret', 'passphrase'],
      'database': ['datastore', 'db', 'storage']
    };

    let mutated = sample.query;

    for (const [original, alternatives] of Object.entries(entityMappings)) {
      if (mutated.includes(original)) {
        const alternative = alternatives[Math.floor(Math.random() * alternatives.length)];
        mutated = mutated.replace(original, alternative);
      }
    }

    return {
      ...sample,
      query: mutated
    };
  }

  async addContext(sample) {
    // Add contextual information to query
    const contexts = [
      'in the authentication system',
      'for the payment flow',
      'in the API layer',
      'across the application'
    ];

    const context = contexts[Math.floor(Math.random() * contexts.length)];

    return {
      ...sample,
      query: `${sample.query} ${context}`
    };
  }

  async increaseComplexity(sample) {
    // Make query more complex
    const complexifiers = [
      'and trace its dependencies',
      'and analyze potential security risks',
      'and find all related components',
      'and explain the data flow'
    ];

    const addition = complexifiers[Math.floor(Math.random() * complexifiers.length)];

    return {
      ...sample,
      query: `${sample.query} ${addition}`,
      difficulty: 'complex'
    };
  }

  /**
   * CODE AUGMENTATION
   *
   * Generate variations of code snippets
   */
  async augmentCode(code) {
    const variations = [];

    // Parse to AST
    try {
      const ast = babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });

      // Apply transformations
      variations.push(await this.renameVariables(ast, code));
      variations.push(await this.reorderStatements(ast, code));
      variations.push(await this.addComments(ast, code));

    } catch (error) {
      // If parse fails, return original
      return [code];
    }

    return variations;
  }

  async renameVariables(ast, code) {
    // Consistently rename variables
    const renames = new Map();

    traverse.default(ast, {
      Identifier(path) {
        const name = path.node.name;

        if (!renames.has(name)) {
          renames.set(name, `${name}_v${renames.size}`);
        }
      }
    });

    let renamed = code;
    for (const [original, replacement] of renames) {
      renamed = renamed.replace(new RegExp(`\\b${original}\\b`, 'g'), replacement);
    }

    return renamed;
  }

  async reorderStatements(ast, code) {
    // Reorder independent statements
    // Simplified: just return original for now
    return code;
  }

  async addComments(ast, code) {
    // Add explanatory comments
    return `// Generated code\n${code}`;
  }

  /**
   * QUALITY FILTERING
   */
  async filterByQuality(samples) {
    const filtered = [];

    for (const sample of samples) {
      const quality = await this.assessQuality(sample);

      if (quality >= this.options.qualityThreshold) {
        sample.quality = quality;
        filtered.push(sample);
      }
    }

    return filtered;
  }

  async assessQuality(sample) {
    let quality = 1.0;

    // Check 1: Query is not too short or too long
    const queryLength = sample.query.length;
    if (queryLength < 10 || queryLength > 500) {
      quality -= 0.3;
    }

    // Check 2: Answer exists and is reasonable
    if (!sample.groundTruth?.answer || sample.groundTruth.answer.length < 10) {
      quality -= 0.4;
    }

    // Check 3: Has required aspects
    if (!sample.groundTruth?.requiredAspects || sample.groundTruth.requiredAspects.length === 0) {
      quality -= 0.2;
    }

    // Check 4: Query is a valid question
    if (!sample.query.includes('?') && !this.isImperativeQuery(sample.query)) {
      quality -= 0.2;
    }

    return Math.max(0, quality);
  }

  isImperativeQuery(query) {
    const imperatives = ['find', 'show', 'list', 'trace', 'explain', 'analyze'];
    return imperatives.some(v => query.toLowerCase().includes(v));
  }

  /**
   * DIVERSITY FILTERING
   */
  ensureDiversity(samples) {
    const diverse = [];
    const features = [];

    for (const sample of samples) {
      const sampleFeatures = this.extractFeatures(sample.query);

      // Check similarity to already selected samples
      let tooSimilar = false;

      for (const existingFeatures of features) {
        const similarity = this.cosineSimilarity(sampleFeatures, existingFeatures);

        if (similarity > (1 - this.options.diversityThreshold)) {
          tooSimilar = true;
          break;
        }
      }

      if (!tooSimilar) {
        diverse.push(sample);
        features.push(sampleFeatures);
      }
    }

    return diverse;
  }

  /**
   * EXTRACT FEATURES
   */
  extractFeatures(query) {
    return {
      length: query.length,
      wordCount: query.split(/\s+/).length,
      hasWhere: query.toLowerCase().includes('where') ? 1 : 0,
      hasHow: query.toLowerCase().includes('how') ? 1 : 0,
      hasWhat: query.toLowerCase().includes('what') ? 1 : 0,
      hasTrace: query.toLowerCase().includes('trace') ? 1 : 0,
      hasFind: query.toLowerCase().includes('find') ? 1 : 0,
      hasSecurity: /security|vulnerability|attack/.test(query.toLowerCase()) ? 1 : 0,
      hasAPI: /api|endpoint|route/.test(query.toLowerCase()) ? 1 : 0,
      hasDB: /database|query|sql/.test(query.toLowerCase()) ? 1 : 0
    };
  }

  cosineSimilarity(features1, features2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const key in features1) {
      if (key in features2) {
        dotProduct += features1[key] * features2[key];
        mag1 += features1[key] * features1[key];
        mag2 += features2[key] * features2[key];
      }
    }

    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  /**
   * INITIALIZE TEMPLATES
   */
  initializeTemplates() {
    return {
      security: [
        {
          difficulty: 'simple',
          query: 'Where is {entity} validated?',
          answer: '{entity} is validated in the {validator} function',
          slots: {
            entity: ['user input', 'password', 'email', 'API key'],
            validator: ['validateInput', 'sanitize', 'checkSecurity']
          },
          relevantDocs: ['validators/index.js'],
          aspects: ['validation', 'security']
        },
        {
          difficulty: 'moderate',
          query: 'How does the application prevent {vulnerability}?',
          answer: 'The application prevents {vulnerability} using {technique}',
          slots: {
            vulnerability: ['SQL injection', 'XSS', 'CSRF', 'command injection'],
            technique: ['parameterized queries', 'input sanitization', 'CSRF tokens', 'sandboxing']
          },
          relevantDocs: ['security/middleware.js'],
          aspects: ['security', 'vulnerability', 'mitigation']
        },
        {
          difficulty: 'complex',
          query: 'Trace the authentication flow from {entry} to {exit}',
          answer: 'Authentication flows from {entry} through middleware to {exit}',
          slots: {
            entry: ['login endpoint', 'API request', 'user submission'],
            exit: ['database verification', 'token generation', 'session creation']
          },
          relevantDocs: ['routes/auth.js', 'middleware/auth.js', 'models/User.js'],
          aspects: ['authentication', 'flow', 'security']
        }
      ],

      architecture: [
        {
          difficulty: 'simple',
          query: 'What design pattern is used for {component}?',
          answer: '{component} uses the {pattern} pattern',
          slots: {
            component: ['database access', 'API routing', 'error handling'],
            pattern: ['singleton', 'factory', 'repository', 'middleware']
          },
          relevantDocs: ['architecture/patterns.md'],
          aspects: ['design pattern', 'architecture']
        },
        {
          difficulty: 'moderate',
          query: 'How are {component1} and {component2} decoupled?',
          answer: 'They are decoupled through {technique}',
          slots: {
            component1: ['frontend', 'API', 'database'],
            component2: ['backend', 'services', 'cache'],
            technique: ['dependency injection', 'event bus', 'interfaces', 'adapters']
          },
          relevantDocs: ['architecture/overview.md'],
          aspects: ['decoupling', 'architecture', 'modularity']
        }
      ],

      api: [
        {
          difficulty: 'simple',
          query: 'Which endpoint handles {operation}?',
          answer: 'The {endpoint} endpoint handles {operation}',
          slots: {
            operation: ['user registration', 'data retrieval', 'file upload', 'deletion'],
            endpoint: ['/api/users', '/api/data', '/api/files', '/api/delete']
          },
          relevantDocs: ['routes/api.js'],
          aspects: ['API', 'endpoint', 'routing']
        }
      ],

      database: [
        {
          difficulty: 'simple',
          query: 'What table stores {data}?',
          answer: '{data} is stored in the {table} table',
          slots: {
            data: ['user credentials', 'session data', 'audit logs', 'preferences'],
            table: ['users', 'sessions', 'logs', 'settings']
          },
          relevantDocs: ['models/schema.js'],
          aspects: ['database', 'schema', 'storage']
        }
      ]
    };
  }

  /**
   * GET STATS
   */
  getStats() {
    return {
      generatedSamples: this.syntheticDataset.length,
      categories: [...new Set(this.syntheticDataset.map(s => s.category))],
      difficulties: [...new Set(this.syntheticDataset.map(s => s.difficulty))],
      avgQuality: this.syntheticDataset.length > 0
        ? this.syntheticDataset.reduce((sum, s) => sum + (s.quality || 0), 0) / this.syntheticDataset.length
        : 0,
      methods: Object.entries(
        this.syntheticDataset.reduce((acc, s) => {
          acc[s.method] = (acc[s.method] || 0) + 1;
          return acc;
        }, {})
      )
    };
  }
}

// Factory function
export function createSyntheticDataGenerator(options) {
  return new SyntheticDataGenerator(options);
}

export default SyntheticDataGenerator;
