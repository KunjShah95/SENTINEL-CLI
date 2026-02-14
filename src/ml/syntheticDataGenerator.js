/**
 * SYNTHETIC DATA GENERATOR
 * 
 * Inspired by DeepMind's synthetic data generation for training ML models.
 * Generates realistic vulnerable code samples for training and testing security models.
 * 
 * Key Features:
 * - Template-based generation
 * - Mutation-based generation
 * - Context-aware generation
 * - Data augmentation
 * - Multi-language support
 */

import { EventEmitter } from 'events';

/**
 * Vulnerability types for generation
 */
export const VulnerabilityType = {
  SQL_INJECTION: 'sql_injection',
  XSS: 'xss',
  COMMAND_INJECTION: 'command_injection',
  PATH_TRAVERSAL: 'path_traversal',
  INSECURE_DESERIALIZATION: 'insecure_deserialization',
  XXE: 'xxe',
  SSRF: 'ssrf',
  IDOR: 'idor',
  AUTH_BYPASS: 'auth_bypass',
  CRYPTO_FAILURES: 'crypto_failures',
  SENSITIVE_DATA_EXPOSURE: 'sensitive_data_exposure',
  XML_EXTERNAL_ENTITIES: 'xml_external_entities',
  BROKEN_ACCESS_CONTROL: 'broken_access_control',
  SECURITY_MISCONFIGURATION: 'security_misconfiguration',
  CSRF: 'csrf',
  UNVALIDATED_REDIRECT: 'unvalidated_redirect'
};

/**
 * Generation strategies
 */
export const GenerationStrategy = {
  TEMPLATE: 'template',        // Template-based
  MUTATION: 'mutation',        // Mutation-based
  GENERATIVE: 'generative',    // AI generative
  HYBRID: 'hybrid'            // Combination
};

export class SyntheticDataGenerator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      strategy: options.strategy || GenerationStrategy.TEMPLATE,
      augmentData: options.augmentData ?? true,
      augmentationFactor: options.augmentFactor || 3,
      preserveLabels: options.preserveLabels ?? true,
      languages: options.languages || ['javascript', 'python', 'java', 'go'],
      includeFix: options.includeFix ?? true,
      difficulty: options.difficulty || 'medium', // easy, medium, hard
      ...options
    };

    // Templates for different vulnerability types
    this.templates = this._initializeTemplates();
    
    // Generated data storage
    this.generatedData = [];
    
    // Statistics
    this.statistics = {
      totalGenerated: 0,
      byVulnerability: {},
      byLanguage: {},
      byDifficulty: {}
    };

    // Seed data for mutation
    this.seedData = [];
  }

  /**
   * Initialize vulnerability templates
   */
  _initializeTemplates() {
    return {
      [VulnerabilityType.SQL_INJECTION]: {
        javascript: [
          {
            vulnerable: "const query = `SELECT * FROM users WHERE id = '${userInput}'`;",
            fixed: "const query = 'SELECT * FROM users WHERE id = ?'; db.execute(query, [userInput]);",
            severity: 'critical'
          },
          {
            vulnerable: "db.query('SELECT * FROM users WHERE name = \"' + name + '\"');",
            fixed: "db.query('SELECT * FROM users WHERE name = ?', [name]);",
            severity: 'critical'
          }
        ],
        python: [
          {
            vulnerable: "cursor.execute(f'SELECT * FROM users WHERE id = {user_id}')",
            fixed: "cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
            severity: 'critical'
          }
        ]
      },
      [VulnerabilityType.XSS]: {
        javascript: [
          {
            vulnerable: "document.innerHTML = '<div>' + userInput + '</div>';",
            fixed: "document.textContent = userInput;",
            severity: 'high'
          },
          {
            vulnerable: "element.innerHTML = userData;",
            fixed: "element.textContent = userData;",
            severity: 'high'
          }
        ],
        python: [
          {
            vulnerable: "response.write('<h1>' + name + '</h1>')",
            fixed: "response.write('<h1>' + escape_html(name) + '</h1>')",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.COMMAND_INJECTION]: {
        javascript: [
          {
            vulnerable: "exec('ls ' + userDir);",
            fixed: "execFile('ls', [userDir]);",
            severity: 'critical'
          },
          {
            vulnerable: "child_process.execSync('cat ' + filename);",
            fixed: "child_process.execFile('cat', [filename]);",
            severity: 'critical'
          }
        ],
        python: [
          {
            vulnerable: "os.system('ls ' + directory)",
            fixed: "os.listdir(directory)",
            severity: 'critical'
          }
        ]
      },
      [VulnerabilityType.PATH_TRAVERSAL]: {
        javascript: [
          {
            vulnerable: "fs.readFileSync('/var/www/' + filename);",
            fixed: "path.resolve('/var/www/', filename).startsWith('/var/www/') ? fs.readFileSync(filename) : null;",
            severity: 'high'
          }
        ],
        python: [
          {
            vulnerable: "open('uploads/' + filename)",
            fixed: "open(os.path.join('uploads', os.path.basename(filename)))",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.INSECURE_DESERIALIZATION]: {
        javascript: [
          {
            vulnerable: "const obj = JSON.parse(untrustedData);",
            fixed: "const obj = JSON.parse(untrustedData); // Use safe parsing",
            severity: 'critical'
          }
        ],
        python: [
          {
            vulnerable: "obj = pickle.loads(data)",
            fixed: "obj = json.loads(data)  # Use JSON instead of pickle",
            severity: 'critical'
          }
        ]
      },
      [VulnerabilityType.SENSITIVE_DATA_EXPOSURE]: {
        javascript: [
          {
            vulnerable: "console.log('API Key:', apiKey);",
            fixed: "console.log('API Key:', apiKey.substring(0, 4) + '****');",
            severity: 'medium'
          },
          {
            vulnerable: "localStorage.setItem('token', jwt);",
            fixed: "sessionStorage.setItem('token', jwt);",
            severity: 'medium'
          }
        ],
        python: [
          {
            vulnerable: "logging.info(f'Password: {password}')",
            fixed: "logging.info('Password: [REDACTED]')",
            severity: 'medium'
          }
        ]
      },
      [VulnerabilityType.AUTH_BYPASS]: {
        javascript: [
          {
            vulnerable: "if (user.isAdmin) { return true; }",
            fixed: "if (await verifyAdmin(user.id)) { return true; }",
            severity: 'critical'
          }
        ],
        python: [
          {
            vulnerable: "if username == 'admin' and password == 'admin':",
            fixed: "if verify_credentials(username, password):",
            severity: 'critical'
          }
        ]
      },
      [VulnerabilityType.CRYPTO_FAILURES]: {
        javascript: [
          {
            vulnerable: "const hash = crypto.createHash('md5').update(data).digest('hex');",
            fixed: "const hash = crypto.createHash('sha256').update(data).digest('hex');",
            severity: 'high'
          }
        ],
        python: [
          {
            vulnerable: "hashlib.md5(data).hexdigest()",
            fixed: "hashlib.sha256(data).hexdigest()",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.CSRF]: {
        javascript: [
          {
            vulnerable: "fetch('/api/transfer', { method: 'POST', body: data })",
            fixed: "fetch('/api/transfer', { method: 'POST', body: data, headers: { 'X-CSRF-Token': token } })",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.SSRF]: {
        javascript: [
          {
            vulnerable: "fetch(userUrl).then(res => res.text())",
            fixed: "if (isInternalUrl(userUrl)) throw new Error('Internal URL not allowed'); fetch(userUrl)",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.IDOR]: {
        javascript: [
          {
            vulnerable: "const user = db.query('SELECT * FROM users WHERE id = ' + req.params.id);",
            fixed: "const user = db.query('SELECT * FROM users WHERE id = ? AND owner_id = ?', [req.params.id, currentUser.id]);",
            severity: 'high'
          }
        ]
      },
      [VulnerabilityType.BROKEN_ACCESS_CONTROL]: {
        javascript: [
          {
            vulnerable: "app.get('/admin/users', (req, res) => { res.json(users); });",
            fixed: "app.get('/admin/users', requireAuth, requireAdmin, (req, res) => { res.json(users); });",
            severity: 'critical'
          }
        ]
      }
    };
  }

  /**
   * Generate synthetic data
   */
  async generate(config = {}) {
    const {
      count = 10,
      vulnerabilityType = null,
      language = null,
      difficulty = this.options.difficulty
    } = config;

    const generated = [];

    // Select vulnerability types
    const types = vulnerabilityType 
      ? [vulnerabilityType] 
      : Object.keys(this.templates);

    // Select languages
    const langs = language 
      ? [language] 
      : this.options.languages;

    for (let i = 0; i < count; i++) {
      // Random selection
      const vType = types[Math.floor(Math.random() * types.length)];
      const lang = langs[Math.floor(Math.random() * langs.length)];
      
      const sample = this._generateSample(vType, lang, difficulty);
      if (sample) {
        generated.push(sample);
        this.generatedData.push(sample);
        
        // Update statistics
        this.statistics.totalGenerated++;
        this.statistics.byVulnerability[vType] = (this.statistics.byVulnerability[vType] || 0) + 1;
        this.statistics.byLanguage[lang] = (this.statistics.byLanguage[lang] || 0) + 1;
        this.statistics.byDifficulty[difficulty] = (this.statistics.byDifficulty[difficulty] || 0) + 1;
      }
    }

    // Apply augmentation if enabled
    if (this.options.augmentData && this.seedData.length > 0) {
      const augmented = await this._augmentData(generated);
      generated.push(...augmented);
    }

    this.emit('data:generated', { count: generated.length });

    return generated;
  }

  /**
   * Generate a single sample
   */
  _generateSample(vulnerabilityType, language, difficulty) {
    const templates = this.templates[vulnerabilityType];
    if (!templates || !templates[language]) {
      return null;
    }

    const langTemplates = templates[language];
    const template = langTemplates[Math.floor(Math.random() * langTemplates.length)];

    // Generate variations based on difficulty
    const variation = this._generateVariation(template, difficulty, language);

    return {
      id: `synth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      vulnerabilityType,
      language,
      difficulty,
      ...variation,
      metadata: {
        generatedAt: Date.now(),
        template: vulnerabilityType,
        severity: template.severity
      }
    };
  }

  /**
   * Generate variation based on difficulty
   */
  _generateVariation(template, difficulty, language) {
    // Apply difficulty modifiers
    const modifiers = {
      easy: { simplify: true, addComments: true },
      medium: { simplify: false, addComments: true },
      hard: { simplify: false, addComments: false, obfuscate: true }
    };

    const mod = modifiers[difficulty] || modifiers.medium;

    let vulnerable = template.vulnerable;
    let fixed = template.fixed;

    // Add comments for easy/medium
    if (mod.addComments) {
      vulnerable = `// VULNERABLE CODE\n${vulnerable}`;
      fixed = `// SECURE CODE\n${fixed}`;
    }

    // Obfuscate for hard
    if (mod.obfuscate) {
      vulnerable = this._obfuscateCode(vulnerable, language);
    }

    // Simplify for easy
    if (mod.simplify) {
      vulnerable = this._simplifyCode(vulnerable);
    }

    return { vulnerable, fixed };
  }

  /**
   * Obfuscate code for harder difficulty
   */
  _obfuscateCode(code, _language) {
    // Simple obfuscation - rename variables
    const variables = ['userInput', 'data', 'name', 'value', 'input', 'param'];
    
    let result = code;
    for (const v of variables) {
      const randomName = v[0] + Math.random().toString(36).substr(2, 5);
      result = result.replace(new RegExp(v, 'g'), randomName);
    }
    
    return result;
  }

  /**
   * Simplify code for easier difficulty
   */
  _simplifyCode(code) {
    // Remove complex expressions
    return code.replace(/\s+/g, ' ').trim();
  }

  /**
   * Augment existing data
   */
  async _augmentData(data) {
    const augmented = [];
    
    for (const sample of data) {
      for (let i = 0; i < this.options.augmentationFactor; i++) {
        const augmentedSample = this._augmentSample(sample);
        augmented.push(augmentedSample);
        this.generatedData.push(augmentedSample);
        this.statistics.totalGenerated++;
      }
    }
    
    return augmented;
  }

  /**
   * Augment a single sample
   */
  _augmentSample(sample) {
    // Apply transformations
    const transformations = [
      this._addWhitespace,
      this._changeVariableNames,
      this._addUnusedCode,
      this._reorderCode
    ];

    const transform = transformations[Math.floor(Math.random() * transformations.length)];
    
    return {
      ...sample,
      id: `synth-aug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      vulnerable: transform(sample.vulnerable),
      fixed: transform(sample.fixed),
      metadata: {
        ...sample.metadata,
        augmented: true,
        originalId: sample.id
      }
    };
  }

  /**
   * Add random whitespace
   */
  _addWhitespace(code) {
    return code.replace(/;/g, '; ');
  }

  /**
   * Change variable names
   */
  _changeVariableNames(code) {
    const names = ['data', 'val', 'item', 'input', 'userData'];
    let result = code;
    for (const name of names) {
      const newName = name[0] + Math.random().toString(36).substr(2, 3);
      result = result.replace(new RegExp(name, 'g'), newName);
    }
    return result;
  }

  /**
   * Add unused code
   */
  _addUnusedCode(code) {
    return `const unused = null;\n${code}`;
  }

  /**
   * Reorder code (simple version)
   */
  _reorderCode(code) {
    // For single-line code, just return as is
    if (!code.includes('\n')) return code;
    
    const lines = code.split('\n');
    const first = lines.shift();
    lines.push(first);
    return lines.join('\n');
  }

  /**
   * Add seed data for mutation
   */
  addSeedData(data) {
    this.seedData.push(...data);
    this.emit('seed_data:added', { count: data.length });
  }

  /**
   * Generate using mutation strategy
   */
  async mutate(config = {}) {
    const { count = 10 } = config;

    if (this.seedData.length === 0) {
      console.warn('No seed data available. Using template generation.');
      return this.generate(config);
    }

    const mutated = [];

    for (let i = 0; i < count; i++) {
      // Select random parent
      const parent = this.seedData[Math.floor(Math.random() * this.seedData.length)];
      
      // Apply mutation
      const child = this._mutateSample(parent);
      mutated.push(child);
      
      this.generatedData.push(child);
      this.statistics.totalGenerated++;
    }

    this.emit('data:mutated', { count: mutated.length });

    return mutated;
  }

  /**
   * Mutate a sample
   */
  _mutateSample(parent) {
    const mutations = [
      this._mutateVariableName,
      this._mutateStringValue,
      this._mutateFunction,
      this._mutateOperator
    ];

    const mutation = mutations[Math.floor(Math.random() * mutations.length)];
    const mutatedCode = mutation(parent.vulnerable || parent.code);

    return {
      ...parent,
      id: `synth-mut-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      vulnerable: mutatedCode,
      metadata: {
        ...parent.metadata,
        mutated: true,
        originalId: parent.id
      }
    };
  }

  /**
   * Mutate variable name
   */
  _mutateVariableName(code) {
    return code.replace(/(\w+)\s*=/g, (match, name) => {
      return name + '_' + Math.floor(Math.random() * 100) + ' =';
    });
  }

  /**
   * Mutate string value
   */
  _mutateStringValue(code) {
    return code.replace(/'([^']*)'/g, (match, str) => {
      return `'${str}_mutated'`;
    });
  }

  /**
   * Mutate function
   */
  _mutateFunction(code) {
    return code.replace(/\.(\w+)\(/g, (match, fn) => {
      return '.' + fn + '_alt(';
    });
  }

  /**
   * Mutate operator
   */
  _mutateOperator(code) {
    return code.replace(/===/g, '==').replace(/!==/g, '!=');
  }

  /**
   * Export generated data
   */
  exportData(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.generatedData, null, 2);
    }
    
    if (format === 'csv') {
      const headers = ['id', 'vulnerabilityType', 'language', 'difficulty', 'vulnerable', 'fixed'];
      const rows = this.generatedData.map(d => 
        headers.map(h => (d[h] || '').replace(/,/g, ';')).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }
    
    return this.generatedData;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      totalSamples: this.generatedData.length,
      uniqueVulnerabilities: Object.keys(this.statistics.byVulnerability).length,
      uniqueLanguages: Object.keys(this.statistics.byLanguage).length
    };
  }

  /**
   * Clear generated data
   */
  clear() {
    this.generatedData = [];
    this.statistics = {
      totalGenerated: 0,
      byVulnerability: {},
      byLanguage: {},
      byDifficulty: {}
    };
    this.emit('data:cleared');
  }

  /**
   * Get supported vulnerability types
   */
  getSupportedVulnerabilities() {
    return Object.keys(this.templates);
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.options.languages;
  }
}

/**
 * Factory function
 */
export function createSyntheticDataGenerator(options) {
  return new SyntheticDataGenerator(options);
}

export default SyntheticDataGenerator;
