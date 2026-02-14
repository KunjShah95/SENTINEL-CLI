import { promises as fs } from 'fs';
import { join, relative, extname, dirname, basename } from 'path';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import { getSessionStore } from './sessionStore.js';
import { glob } from 'glob';

/**
 * Enhanced Context Agent - Deep codebase understanding and relationship mapping
 */
export class EnhancedContextAgent {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.sessionStore = getSessionStore();
    this.cache = new Map();
  }

  /**
   * Analyze project and build comprehensive context
   */
  async analyzeProject(options = {}) {
    const {
      buildGraph = true,
      detectPatterns = true,
      analyzeRisks = true
    } = options;

    const context = {
      projectPath: this.projectPath,
      analyzedAt: new Date().toISOString(),
      metadata: await this.getProjectMetadata(),
      fileStructure: await this.analyzeFileStructure(),
      technology: await this.detectTechnologyStack(),
      framework: await this.detectFramework(),
      architecture: await this.detectArchitecture(),
      dependencies: await this.analyzeDependencies(),
      codeGraph: buildGraph ? await this.buildCodeGraph() : null,
      securityControls: await this.detectSecurityControls(),
      riskAreas: analyzeRisks ? await this.identifyRiskAreas() : [],
      patterns: detectPatterns ? await this.detectCodePatterns() : {},
      apiEndpoints: await this.discoverAPIEndpoints(),
      dataFlows: await this.analyzeDataFlows(),
      entryPoints: await this.findEntryPoints()
    };

    // Store knowledge in session store
    await this.storeKnowledge(context);

    return context;
  }

  /**
   * Get project metadata
   */
  async getProjectMetadata() {
    const metadata = {
      name: null,
      version: null,
      description: null,
      license: null,
      author: null,
      repository: null
    };

    try {
      const pkgPath = join(this.projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      metadata.name = pkg.name;
      metadata.version = pkg.version;
      metadata.description = pkg.description;
      metadata.license = pkg.license;
      metadata.author = pkg.author;
      metadata.repository = pkg.repository;
    } catch (err) {
      // No package.json or can't read it
    }

    return metadata;
  }

  /**
   * Analyze file structure
   */
  async analyzeFileStructure() {
    const structure = {
      totalFiles: 0,
      byExtension: {},
      byDirectory: {},
      sourceFiles: [],
      testFiles: [],
      configFiles: []
    };

    const files = await glob('**/*', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      nodir: true
    });

    for (const file of files) {
      structure.totalFiles++;

      const ext = extname(file);
      structure.byExtension[ext] = (structure.byExtension[ext] || 0) + 1;

      const dir = dirname(file);
      structure.byDirectory[dir] = (structure.byDirectory[dir] || 0) + 1;

      // Categorize files
      if (this.isSourceFile(file)) {
        structure.sourceFiles.push(file);
      }
      if (this.isTestFile(file)) {
        structure.testFiles.push(file);
      }
      if (this.isConfigFile(file)) {
        structure.configFiles.push(file);
      }
    }

    return structure;
  }

  /**
   * Detect technology stack
   */
  async detectTechnologyStack() {
    const stack = {
      languages: [],
      runtime: null,
      packageManager: null,
      buildTools: [],
      linters: [],
      testing: [],
      ci: []
    };

    const files = await glob('*', { cwd: this.projectPath });

    // Detect package manager
    if (files.includes('package-lock.json')) stack.packageManager = 'npm';
    if (files.includes('yarn.lock')) stack.packageManager = 'yarn';
    if (files.includes('pnpm-lock.yaml')) stack.packageManager = 'pnpm';
    if (files.includes('bun.lockb')) stack.packageManager = 'bun';

    // Detect languages
    const extensions = await this.getFileExtensions();
    if (extensions.includes('.js') || extensions.includes('.mjs')) stack.languages.push('JavaScript');
    if (extensions.includes('.ts')) stack.languages.push('TypeScript');
    if (extensions.includes('.py')) stack.languages.push('Python');
    if (extensions.includes('.go')) stack.languages.push('Go');
    if (extensions.includes('.rs')) stack.languages.push('Rust');
    if (extensions.includes('.java')) stack.languages.push('Java');

    // Detect runtime
    if (files.includes('package.json')) stack.runtime = 'Node.js';
    if (files.includes('requirements.txt') || files.includes('setup.py')) stack.runtime = 'Python';
    if (files.includes('go.mod')) stack.runtime = 'Go';
    if (files.includes('Cargo.toml')) stack.runtime = 'Rust';

    // Detect build tools
    if (files.includes('webpack.config.js')) stack.buildTools.push('Webpack');
    if (files.includes('vite.config.js') || files.includes('vite.config.ts')) stack.buildTools.push('Vite');
    if (files.includes('rollup.config.js')) stack.buildTools.push('Rollup');
    if (files.includes('tsconfig.json')) stack.buildTools.push('TypeScript');

    // Detect linters
    if (files.includes('.eslintrc.js') || files.includes('.eslintrc.json')) stack.linters.push('ESLint');
    if (files.includes('.prettierrc')) stack.linters.push('Prettier');

    // Detect testing frameworks
    const pkg = await this.readPackageJson();
    if (pkg) {
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps.jest) stack.testing.push('Jest');
      if (allDeps.mocha) stack.testing.push('Mocha');
      if (allDeps.vitest) stack.testing.push('Vitest');
      if (allDeps.cypress) stack.testing.push('Cypress');
      if (allDeps.playwright) stack.testing.push('Playwright');
    }

    // Detect CI
    const ciFiles = await glob('.github/workflows/*.{yml,yaml}', { cwd: this.projectPath });
    if (ciFiles.length > 0) stack.ci.push('GitHub Actions');
    if (files.includes('.gitlab-ci.yml')) stack.ci.push('GitLab CI');
    if (files.includes('.circleci')) stack.ci.push('CircleCI');

    return stack;
  }

  /**
   * Detect framework
   */
  async detectFramework() {
    const frameworks = {
      frontend: [],
      backend: [],
      fullstack: [],
      mobile: [],
      desktop: []
    };

    const pkg = await this.readPackageJson();
    if (!pkg) return frameworks;

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Frontend frameworks
    if (allDeps.react || allDeps['react-dom']) frameworks.frontend.push('React');
    if (allDeps.vue) frameworks.frontend.push('Vue');
    if (allDeps['@angular/core']) frameworks.frontend.push('Angular');
    if (allDeps.svelte) frameworks.frontend.push('Svelte');
    if (allDeps.next) frameworks.fullstack.push('Next.js');
    if (allDeps.nuxt) frameworks.fullstack.push('Nuxt.js');

    // Backend frameworks
    if (allDeps.express) frameworks.backend.push('Express');
    if (allDeps.koa) frameworks.backend.push('Koa');
    if (allDeps.fastify) frameworks.backend.push('Fastify');
    if (allDeps.nestjs || allDeps['@nestjs/core']) frameworks.backend.push('NestJS');
    if (allDeps.hapi || allDeps['@hapi/hapi']) frameworks.backend.push('Hapi');

    // Mobile
    if (allDeps['react-native']) frameworks.mobile.push('React Native');
    if (allDeps.expo) frameworks.mobile.push('Expo');

    // Desktop
    if (allDeps.electron) frameworks.desktop.push('Electron');
    if (allDeps.tauri) frameworks.desktop.push('Tauri');

    return frameworks;
  }

  /**
   * Detect architecture patterns
   */
  async detectArchitecture() {
    const architecture = {
      pattern: 'unknown',
      layers: [],
      features: []
    };

    const dirs = await this.getDirectoryStructure();

    // Detect MVC
    if (dirs.includes('models') && dirs.includes('views') && dirs.includes('controllers')) {
      architecture.pattern = 'MVC';
      architecture.layers = ['models', 'views', 'controllers'];
    }

    // Detect layered architecture
    if (dirs.includes('domain') && dirs.includes('application') && dirs.includes('infrastructure')) {
      architecture.pattern = 'Clean Architecture';
      architecture.layers = ['domain', 'application', 'infrastructure'];
    }

    // Detect microservices
    if (dirs.includes('services') || dirs.filter(d => d.startsWith('service-')).length > 1) {
      architecture.pattern = 'Microservices';
      architecture.features.push('service-oriented');
    }

    // Detect monorepo
    if (dirs.includes('packages') || dirs.includes('apps')) {
      architecture.features.push('monorepo');
    }

    // Detect API-first
    if (dirs.includes('api') || dirs.includes('routes') || dirs.includes('endpoints')) {
      architecture.features.push('api-first');
    }

    return architecture;
  }

  /**
   * Analyze dependencies
   */
  async analyzeDependencies() {
    const deps = {
      production: {},
      development: {},
      total: 0,
      outdated: [],
      vulnerable: [],
      licenses: {}
    };

    const pkg = await this.readPackageJson();
    if (!pkg) return deps;

    deps.production = pkg.dependencies || {};
    deps.development = pkg.devDependencies || {};
    deps.total = Object.keys(deps.production).length + Object.keys(deps.development).length;

    return deps;
  }

  /**
   * Build code graph (imports/exports relationships)
   */
  async buildCodeGraph() {
    const graph = {
      nodes: new Map(),
      edges: [],
      clusters: []
    };

    const sourceFiles = await glob('**/*.{js,jsx,ts,tsx,mjs}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    for (const file of sourceFiles) {
      const filePath = join(this.projectPath, file);
      const node = await this.analyzeFile(filePath);
      graph.nodes.set(file, node);

      // Add edges for imports
      for (const imp of node.imports) {
        graph.edges.push({
          from: file,
          to: imp.source,
          type: 'import',
          specifiers: imp.specifiers
        });
      }
    }

    // Detect circular dependencies
    graph.circularDependencies = this.detectCircularDependencies(graph);

    return graph;
  }

  /**
   * Analyze individual file
   */
  async analyzeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = relative(this.projectPath, filePath);

    const node = {
      path: relativePath,
      size: content.length,
      lines: content.split('\n').length,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      hooks: [],
      components: [],
      complexity: 0
    };

    try {
      const ast = babelParse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });

      traverse.default(ast, {
        ImportDeclaration(path) {
          node.imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(s => s.local.name)
          });
        },
        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            if (path.node.declaration.declarations) {
              path.node.declaration.declarations.forEach(d => {
                node.exports.push({ name: d.id.name, type: 'named' });
              });
            }
          }
        },
        ExportDefaultDeclaration(_path) {
          node.exports.push({ name: 'default', type: 'default' });
        },
        FunctionDeclaration(path) {
          if (path.node.id) {
            node.functions.push({
              name: path.node.id.name,
              params: path.node.params.length,
              async: path.node.async
            });
          }
        },
        ClassDeclaration(path) {
          if (path.node.id) {
            node.classes.push({
              name: path.node.id.name,
              methods: path.node.body.body.filter(m => m.type === 'ClassMethod').length
            });
          }
        },
        CallExpression(path) {
          // Detect React hooks
          if (path.node.callee.name && path.node.callee.name.startsWith('use')) {
            node.hooks.push(path.node.callee.name);
          }
        }
      });

      // Detect React components
      if (node.exports.some(e => e.name && /^[A-Z]/.test(e.name))) {
        node.components = node.exports.filter(e => /^[A-Z]/.test(e.name)).map(e => e.name);
      }

    } catch (err) {
      // Parse error - skip AST analysis
      node.parseError = err.message;
    }

    return node;
  }

  /**
   * Detect security controls in use
   */
  async detectSecurityControls() {
    const controls = {
      authentication: [],
      authorization: [],
      encryption: [],
      validation: [],
      rateLimiting: [],
      cors: [],
      headers: [],
      csrf: [],
      xss: [],
      sqlInjection: []
    };

    const pkg = await this.readPackageJson();
    if (!pkg) return controls;

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Authentication
    if (allDeps.passport) controls.authentication.push('Passport');
    if (allDeps.jsonwebtoken || allDeps.jwt) controls.authentication.push('JWT');
    if (allDeps.bcrypt || allDeps.bcryptjs) controls.authentication.push('bcrypt');

    // Authorization
    if (allDeps.casl) controls.authorization.push('CASL');
    if (allDeps.accesscontrol) controls.authorization.push('AccessControl');

    // Validation
    if (allDeps.joi) controls.validation.push('Joi');
    if (allDeps.yup) controls.validation.push('Yup');
    if (allDeps.zod) controls.validation.push('Zod');
    if (allDeps['express-validator']) controls.validation.push('express-validator');

    // Rate limiting
    if (allDeps['express-rate-limit']) controls.rateLimiting.push('express-rate-limit');
    if (allDeps['rate-limiter-flexible']) controls.rateLimiting.push('rate-limiter-flexible');

    // CORS
    if (allDeps.cors) controls.cors.push('cors');

    // Security headers
    if (allDeps.helmet) controls.headers.push('helmet');

    // CSRF
    if (allDeps.csurf) controls.csrf.push('csurf');

    // XSS
    if (allDeps['xss-clean']) controls.xss.push('xss-clean');
    if (allDeps['dompurify']) controls.xss.push('DOMPurify');

    // SQL injection
    if (allDeps.sequelize || allDeps.knex || allDeps['prisma']) {
      controls.sqlInjection.push('ORM/Query Builder');
    }

    return controls;
  }

  /**
   * Identify risk areas
   */
  async identifyRiskAreas() {
    const risks = [];

    const sourceFiles = await glob('**/*.{js,jsx,ts,tsx,py,go}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/test/**', '**/tests/**']
    });

    const riskPatterns = {
      auth: /auth|login|signin|signup|register|password|credential/i,
      payment: /payment|billing|checkout|stripe|paypal|charge/i,
      database: /query|execute|sql|db\.|database/i,
      fileSystem: /readFile|writeFile|unlink|fs\./i,
      network: /fetch|axios|request|http\.|https\./i,
      eval: /eval\(|Function\(|vm\./i,
      crypto: /crypto|encrypt|decrypt|hash|sign|verify/i,
      admin: /admin|superuser|root/i
    };

    for (const file of sourceFiles) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      for (const [category, pattern] of Object.entries(riskPatterns)) {
        if (pattern.test(content)) {
          risks.push({
            file,
            category,
            reason: `Contains ${category}-related code`,
            severity: this.getRiskSeverity(category)
          });
          break; // One risk per file
        }
      }
    }

    return risks;
  }

  /**
   * Detect code patterns
   */
  async detectCodePatterns() {
    const patterns = {
      designPatterns: [],
      antiPatterns: [],
      bestPractices: [],
      codeSmells: []
    };

    // This would be enhanced with actual pattern detection
    // For now, return structure

    return patterns;
  }

  /**
   * Discover API endpoints
   */
  async discoverAPIEndpoints() {
    const endpoints = [];

    const routeFiles = await glob('**/{routes,api,controllers}/**/*.{js,ts}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**']
    });

    for (const file of routeFiles) {
      const filePath = join(this.projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Detect Express routes
      const routeMatches = content.matchAll(/\.(get|post|put|patch|delete|all)\(['"]([^'"]+)['"]/gi);
      for (const match of routeMatches) {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: file,
          framework: 'Express'
        });
      }

      // Detect Fastify routes
      const fastifyMatches = content.matchAll(/fastify\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/gi);
      for (const match of fastifyMatches) {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: file,
          framework: 'Fastify'
        });
      }
    }

    return endpoints;
  }

  /**
   * Analyze data flows
   */
  async analyzeDataFlows() {
    const flows = {
      userInput: [],
      database: [],
      api: [],
      fileSystem: []
    };

    // This would be enhanced with actual data flow analysis
    return flows;
  }

  /**
   * Find entry points
   */
  async findEntryPoints() {
    const entryPoints = [];

    const commonEntries = [
      'index.js', 'index.ts', 'main.js', 'main.ts',
      'app.js', 'app.ts', 'server.js', 'server.ts',
      'src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts'
    ];

    for (const entry of commonEntries) {
      const filePath = join(this.projectPath, entry);
      try {
        await fs.access(filePath);
        entryPoints.push(entry);
      } catch {
        // File doesn't exist
      }
    }

    // Check package.json main field
    const pkg = await this.readPackageJson();
    if (pkg && pkg.main && !entryPoints.includes(pkg.main)) {
      entryPoints.push(pkg.main);
    }

    return entryPoints;
  }

  /**
   * Store knowledge in session store
   */
  async storeKnowledge(context) {
    const store = this.sessionStore;

    // Store framework
    if (context.framework) {
      for (const [category, frameworks] of Object.entries(context.framework)) {
        if (frameworks.length > 0) {
          store.setKnowledge(this.projectPath, 'framework', category, frameworks, 1.0, 'detected');
        }
      }
    }

    // Store architecture
    if (context.architecture) {
      store.setKnowledge(this.projectPath, 'architecture', 'pattern', context.architecture.pattern, 1.0, 'detected');
      store.setKnowledge(this.projectPath, 'architecture', 'features', context.architecture.features, 1.0, 'detected');
    }

    // Store security controls
    if (context.securityControls) {
      for (const [category, controls] of Object.entries(context.securityControls)) {
        if (controls.length > 0) {
          store.setKnowledge(this.projectPath, 'security_control', category, controls, 1.0, 'detected');
        }
      }
    }

    // Store risk areas
    if (context.riskAreas) {
      store.setKnowledge(this.projectPath, 'risk_area', 'high_risk_files',
        context.riskAreas.filter(r => r.severity === 'high').map(r => r.file),
        0.9, 'detected'
      );
    }

    // Store technology stack
    if (context.technology) {
      store.setKnowledge(this.projectPath, 'technology', 'languages', context.technology.languages, 1.0, 'detected');
      store.setKnowledge(this.projectPath, 'technology', 'runtime', context.technology.runtime, 1.0, 'detected');
    }
  }

  /**
   * Get context summary
   */
  async getContextSummary() {
    const knowledge = this.sessionStore.getKnowledge(this.projectPath);

    const summary = {
      projectPath: this.projectPath,
      framework: knowledge.filter(k => k.knowledge_type === 'framework'),
      architecture: knowledge.filter(k => k.knowledge_type === 'architecture'),
      securityControls: knowledge.filter(k => k.knowledge_type === 'security_control'),
      riskAreas: knowledge.filter(k => k.knowledge_type === 'risk_area'),
      technology: knowledge.filter(k => k.knowledge_type === 'technology')
    };

    return summary;
  }

  // Helper methods
  isSourceFile(file) {
    const sourceExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java'];
    return sourceExts.some(ext => file.endsWith(ext)) && !this.isTestFile(file);
  }

  isTestFile(file) {
    return /\.(test|spec)\.(js|jsx|ts|tsx)$/.test(file) || /\/__tests__\//.test(file);
  }

  isConfigFile(file) {
    const configFiles = [
      'package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js',
      '.eslintrc.js', '.prettierrc', 'jest.config.js', '.gitignore'
    ];
    const fileName = basename(file);
    return configFiles.includes(fileName) || fileName.startsWith('.');
  }

  async getFileExtensions() {
    const files = await glob('**/*', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      nodir: true
    });

    return [...new Set(files.map(f => extname(f)).filter(Boolean))];
  }

  async getDirectoryStructure() {
    const dirs = await glob('*/', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    return dirs.map(d => d.replace(/\/$/, ''));
  }

  async readPackageJson() {
    try {
      const pkgPath = join(this.projectPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  detectCircularDependencies(graph) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (node, path = []) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart).concat(node));
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const edges = graph.edges.filter(e => e.from === node);
      for (const edge of edges) {
        dfs(edge.to, [...path]);
      }

      recursionStack.delete(node);
    };

    for (const node of graph.nodes.keys()) {
      dfs(node);
    }

    return cycles;
  }

  getRiskSeverity(category) {
    const highRisk = ['auth', 'payment', 'eval', 'admin'];
    const mediumRisk = ['database', 'crypto', 'fileSystem'];

    if (highRisk.includes(category)) return 'high';
    if (mediumRisk.includes(category)) return 'medium';
    return 'low';
  }

  clearCache() {
    this.cache.clear();
  }
}

// Factory function
export function createContextAgent(projectPath) {
  return new EnhancedContextAgent(projectPath);
}

export default EnhancedContextAgent;
