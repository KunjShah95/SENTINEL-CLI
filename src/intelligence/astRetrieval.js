/**
 * AST-AWARE CODE RETRIEVAL ENGINE
 *
 * Deep code understanding through Abstract Syntax Tree analysis
 *
 * Features:
 * - Structural similarity (not just text similarity)
 * - Function signature matching
 * - Control flow understanding
 * - Data flow analysis
 * - Pattern-based retrieval
 * - Type-aware search
 */

import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';
import crypto from 'crypto';

export class ASTAwareRetrieval {
  constructor(options = {}) {
    this.options = {
      cacheASTs: options.cacheASTs !== false,
      maxCacheSize: options.maxCacheSize || 1000,
      structureWeight: options.structureWeight || 0.6,
      textWeight: options.textWeight || 0.4,
      ...options
    };

    this.astCache = new Map();
    this.structureIndex = new Map();
    this.patternIndex = new Map();
  }

  /**
   * INDEX CODE WITH AST ANALYSIS
   */
  async indexCode(code, metadata = {}) {
    const cacheKey = this.hashCode(code);

    // Check cache
    if (this.astCache.has(cacheKey)) {
      return this.astCache.get(cacheKey);
    }

    // Parse to AST
    const ast = await this.parseToAST(code);

    if (!ast) {
      return null; // Parse error
    }

    // Extract structural features
    const structure = this.extractStructure(ast);

    // Extract patterns
    const patterns = this.extractPatterns(ast);

    // Extract semantic features
    const semantics = this.extractSemantics(ast);

    // Build index entry
    const indexEntry = {
      code,
      metadata,
      ast,
      structure,
      patterns,
      semantics,
      hash: cacheKey
    };

    // Cache it
    if (this.options.cacheASTs) {
      this.manageCacheSize();
      this.astCache.set(cacheKey, indexEntry);
    }

    // Index by structure
    this.indexByStructure(indexEntry);

    // Index by patterns
    this.indexByPatterns(indexEntry);

    return indexEntry;
  }

  /**
   * STRUCTURAL SIMILARITY SEARCH
   *
   * Find code with similar structure (not just text)
   */
  async structuralSearch(query, codeCorpus, options = {}) {
    const {
      topK = 10,
      minSimilarity = 0.5,
      structureWeight = this.options.structureWeight,
      textWeight = this.options.textWeight
    } = options;

    // Parse query to AST
    const queryAST = await this.indexCode(query);

    if (!queryAST) {
      return []; // Parse error
    }

    // Score all code in corpus
    const scores = [];

    for (const code of codeCorpus) {
      const codeAST = await this.indexCode(code.content, code.metadata);

      if (!codeAST) continue;

      // Calculate structural similarity
      const structureSimilarity = this.calculateStructuralSimilarity(
        queryAST.structure,
        codeAST.structure
      );

      // Calculate text similarity (fallback)
      const textSimilarity = this.calculateTextSimilarity(query, code.content);

      // Combined score
      const combinedScore =
        structureSimilarity * structureWeight +
        textSimilarity * textWeight;

      if (combinedScore >= minSimilarity) {
        scores.push({
          code: code.content,
          metadata: code.metadata,
          score: combinedScore,
          structureSimilarity,
          textSimilarity,
          matchedPatterns: this.findMatchingPatterns(queryAST, codeAST)
        });
      }
    }

    // Sort and return top K
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * FUNCTION SIGNATURE MATCHING
   *
   * Find functions with similar signatures
   */
  async findSimilarFunctions(targetFunction, codeCorpus) {
    const targetAST = await this.indexCode(targetFunction);

    if (!targetAST || !targetAST.structure.functions.length) {
      return [];
    }

    const targetFunc = targetAST.structure.functions[0];
    const matches = [];

    for (const code of codeCorpus) {
      const codeAST = await this.indexCode(code.content, code.metadata);

      if (!codeAST) continue;

      for (const func of codeAST.structure.functions) {
        const similarity = this.compareFunctionSignatures(targetFunc, func);

        if (similarity > 0.7) {
          matches.push({
            code: code.content,
            metadata: code.metadata,
            function: func,
            similarity
          });
        }
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * PATTERN-BASED RETRIEVAL
   *
   * Find code matching specific patterns (e.g., "try-catch with finally")
   */
  async findByPattern(patternType, codeCorpus) {
    const matches = [];

    for (const code of codeCorpus) {
      const codeAST = await this.indexCode(code.content, code.metadata);

      if (!codeAST) continue;

      if (codeAST.patterns[patternType]) {
        matches.push({
          code: code.content,
          metadata: code.metadata,
          pattern: patternType,
          occurrences: codeAST.patterns[patternType]
        });
      }
    }

    return matches;
  }

  /**
   * CONTROL FLOW ANALYSIS
   *
   * Understand and match control flow patterns
   */
  analyzeControlFlow(ast) {
    const controlFlow = {
      conditionals: 0,
      loops: 0,
      exceptions: 0,
      returns: 0,
      branches: [],
      depth: 0
    };

    let currentDepth = 0;
    let maxDepth = 0;

    traverse.default(ast, {
      IfStatement(path) {
        controlFlow.conditionals++;
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
        controlFlow.branches.push({
          type: 'if',
          depth: currentDepth,
          line: path.node.loc?.start.line
        });
      },
      'IfStatement:exit'() {
        currentDepth--;
      },

      WhileStatement(path) {
        controlFlow.loops++;
        controlFlow.branches.push({
          type: 'while',
          line: path.node.loc?.start.line
        });
      },

      ForStatement(path) {
        controlFlow.loops++;
        controlFlow.branches.push({
          type: 'for',
          line: path.node.loc?.start.line
        });
      },

      TryStatement(path) {
        controlFlow.exceptions++;
        controlFlow.branches.push({
          type: 'try-catch',
          line: path.node.loc?.start.line
        });
      },

      ReturnStatement() {
        controlFlow.returns++;
      }
    });

    controlFlow.depth = maxDepth;
    controlFlow.complexity = this.calculateCyclomaticComplexity(controlFlow);

    return controlFlow;
  }

  /**
   * DATA FLOW ANALYSIS
   *
   * Track variable usage and dependencies
   */
  analyzeDataFlow(ast) {
    const dataFlow = {
      variables: new Map(),
      parameters: [],
      dependencies: [],
      sideEffects: []
    };

    traverse.default(ast, {
      VariableDeclarator(path) {
        const name = path.node.id.name;
        dataFlow.variables.set(name, {
          declared: path.node.loc?.start.line,
          type: path.parent.kind,
          initialized: path.node.init !== null
        });
      },

      FunctionDeclaration(path) {
        path.node.params.forEach(param => {
          if (param.type === 'Identifier') {
            dataFlow.parameters.push(param.name);
          }
        });
      },

      AssignmentExpression(path) {
        if (path.node.left.type === 'Identifier') {
          const name = path.node.left.name;
          const varInfo = dataFlow.variables.get(name);

          if (varInfo) {
            varInfo.modified = varInfo.modified || [];
            varInfo.modified.push(path.node.loc?.start.line);
          }
        }
      },

      CallExpression(path) {
        // Detect potential side effects
        if (this.hasSideEffects(path.node)) {
          dataFlow.sideEffects.push({
            line: path.node.loc?.start.line,
            callee: path.node.callee.name || 'anonymous'
          });
        }
      }
    });

    return dataFlow;
  }

  /**
   * EXTRACT STRUCTURE
   */
  extractStructure(ast) {
    const structure = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      variables: [],
      controlFlow: this.analyzeControlFlow(ast),
      dataFlow: this.analyzeDataFlow(ast)
    };

    traverse.default(ast, {
      FunctionDeclaration(path) {
        if (!path.node.id) return;

        structure.functions.push({
          name: path.node.id.name,
          params: path.node.params.map(p => p.name || 'destructured'),
          async: path.node.async,
          generator: path.node.generator,
          line: path.node.loc?.start.line,
          bodyLength: path.node.body.body.length
        });
      },

      ArrowFunctionExpression(path) {
        // Count arrow functions
        structure.functions.push({
          name: 'arrow_function',
          params: path.node.params.map(p => p.name || 'destructured'),
          async: path.node.async,
          line: path.node.loc?.start.line
        });
      },

      ClassDeclaration(path) {
        if (!path.node.id) return;

        const methods = path.node.body.body
          .filter(m => m.type === 'ClassMethod')
          .map(m => ({
            name: m.key.name,
            kind: m.kind,
            static: m.static,
            async: m.async
          }));

        structure.classes.push({
          name: path.node.id.name,
          superClass: path.node.superClass?.name,
          methods,
          line: path.node.loc?.start.line
        });
      },

      ImportDeclaration(path) {
        structure.imports.push({
          source: path.node.source.value,
          specifiers: path.node.specifiers.length
        });
      },

      ExportNamedDeclaration(path) {
        structure.exports.push({
          type: 'named',
          line: path.node.loc?.start.line
        });
      },

      VariableDeclaration(path) {
        structure.variables.push({
          kind: path.node.kind,
          count: path.node.declarations.length
        });
      }
    });

    return structure;
  }

  /**
   * EXTRACT PATTERNS
   */
  extractPatterns(ast) {
    const patterns = {
      tryCatchFinally: 0,
      asyncAwait: 0,
      promiseChain: 0,
      callbacks: 0,
      destructuring: 0,
      spreadOperator: 0,
      templateLiterals: 0,
      classInheritance: 0,
      HOF: 0, // Higher Order Functions
      recursion: 0
    };

    const functionNames = new Set();

    traverse.default(ast, {
      TryStatement(_path) {
        patterns.tryCatchFinally++;
      },

      AwaitExpression() {
        patterns.asyncAwait++;
      },

      CallExpression(path) {
        // Detect promise chains
        if (path.node.callee.property?.name === 'then') {
          patterns.promiseChain++;
        }

        // Detect callbacks
        const lastArg = path.node.arguments[path.node.arguments.length - 1];
        if (lastArg && (lastArg.type === 'FunctionExpression' || lastArg.type === 'ArrowFunctionExpression')) {
          patterns.callbacks++;
        }

        // Detect recursion
        if (path.node.callee.name && functionNames.has(path.node.callee.name)) {
          patterns.recursion++;
        }

        // Detect HOF
        if (path.node.callee.name && ['map', 'filter', 'reduce', 'forEach'].includes(path.node.callee.name)) {
          patterns.HOF++;
        }
      },

      ObjectPattern() {
        patterns.destructuring++;
      },

      SpreadElement() {
        patterns.spreadOperator++;
      },

      TemplateLiteral() {
        patterns.templateLiterals++;
      },

      ClassDeclaration(path) {
        if (path.node.superClass) {
          patterns.classInheritance++;
        }

        if (path.node.id) {
          functionNames.add(path.node.id.name);
        }
      },

      FunctionDeclaration(path) {
        if (path.node.id) {
          functionNames.add(path.node.id.name);
        }
      }
    });

    return patterns;
  }

  /**
   * EXTRACT SEMANTICS
   */
  extractSemantics(ast) {
    const semantics = {
      ioOperations: 0,
      networkCalls: 0,
      databaseOps: 0,
      fileSystem: 0,
      cryptoOps: 0,
      authentication: 0,
      validation: 0
    };

    traverse.default(ast, {
      CallExpression(path) {
        const callee = path.node.callee.name || path.node.callee.property?.name || '';

        // IO operations
        if (/read|write|open|close|stream/i.test(callee)) {
          semantics.ioOperations++;
        }

        // Network calls
        if (/fetch|axios|request|http|ajax/i.test(callee)) {
          semantics.networkCalls++;
        }

        // Database operations
        if (/query|execute|save|find|update|delete/i.test(callee)) {
          semantics.databaseOps++;
        }

        // File system
        if (/readFile|writeFile|unlink|mkdir|fs\./i.test(callee)) {
          semantics.fileSystem++;
        }

        // Crypto
        if (/encrypt|decrypt|hash|sign|verify|crypto/i.test(callee)) {
          semantics.cryptoOps++;
        }

        // Authentication
        if (/auth|login|logout|verify|token/i.test(callee)) {
          semantics.authentication++;
        }

        // Validation
        if (/validate|check|sanitize|verify/i.test(callee)) {
          semantics.validation++;
        }
      }
    });

    return semantics;
  }

  /**
   * SIMILARITY CALCULATIONS
   */

  calculateStructuralSimilarity(struct1, struct2) {
    let similarity = 0;
    let totalWeight = 0;

    // Function count similarity
    const funcWeight = 0.25;
    similarity += this.normalizedDifference(
      struct1.functions.length,
      struct2.functions.length
    ) * funcWeight;
    totalWeight += funcWeight;

    // Class count similarity
    const classWeight = 0.20;
    similarity += this.normalizedDifference(
      struct1.classes.length,
      struct2.classes.length
    ) * classWeight;
    totalWeight += classWeight;

    // Control flow similarity
    const cfWeight = 0.30;
    similarity += this.compareControlFlow(
      struct1.controlFlow,
      struct2.controlFlow
    ) * cfWeight;
    totalWeight += cfWeight;

    // Import/Export similarity
    const ieWeight = 0.15;
    similarity += this.normalizedDifference(
      struct1.imports.length,
      struct2.imports.length
    ) * ieWeight;
    totalWeight += ieWeight;

    // Variable similarity
    const varWeight = 0.10;
    similarity += this.normalizedDifference(
      struct1.variables.length,
      struct2.variables.length
    ) * varWeight;
    totalWeight += varWeight;

    return similarity / totalWeight;
  }

  compareControlFlow(cf1, cf2) {
    let similarity = 0;

    // Compare conditionals
    similarity += this.normalizedDifference(cf1.conditionals, cf2.conditionals) * 0.3;

    // Compare loops
    similarity += this.normalizedDifference(cf1.loops, cf2.loops) * 0.3;

    // Compare depth
    similarity += this.normalizedDifference(cf1.depth, cf2.depth) * 0.2;

    // Compare complexity
    similarity += this.normalizedDifference(cf1.complexity, cf2.complexity) * 0.2;

    return similarity;
  }

  compareFunctionSignatures(func1, func2) {
    let similarity = 0;

    // Parameter count
    similarity += this.normalizedDifference(
      func1.params.length,
      func2.params.length
    ) * 0.4;

    // Async/generator
    if (func1.async === func2.async) similarity += 0.2;
    if (func1.generator === func2.generator) similarity += 0.2;

    // Body length
    if (func1.bodyLength && func2.bodyLength) {
      similarity += this.normalizedDifference(
        func1.bodyLength,
        func2.bodyLength
      ) * 0.2;
    }

    return similarity;
  }

  normalizedDifference(a, b) {
    if (a === 0 && b === 0) return 1;
    const max = Math.max(a, b);
    if (max === 0) return 1;
    return 1 - Math.abs(a - b) / max;
  }

  calculateTextSimilarity(text1, text2) {
    // Simple Jaccard similarity
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  findMatchingPatterns(ast1, ast2) {
    const matches = [];

    for (const [pattern, count1] of Object.entries(ast1.patterns)) {
      const count2 = ast2.patterns[pattern] || 0;

      if (count1 > 0 && count2 > 0) {
        matches.push({
          pattern,
          similarity: this.normalizedDifference(count1, count2)
        });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * HELPER METHODS
   */

  async parseToAST(code) {
    try {
      return babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
        errorRecovery: true
      });
    } catch (error) {
      console.warn('AST parse error:', error.message);
      return null;
    }
  }

  calculateCyclomaticComplexity(controlFlow) {
    // V(G) = E - N + 2P where E=edges, N=nodes, P=connected components
    // Simplified: count decision points + 1
    return controlFlow.conditionals + controlFlow.loops + 1;
  }

  hasSideEffects(callNode) {
    const callee = callNode.callee.name || callNode.callee.property?.name || '';

    // Known side-effect patterns
    return /set|add|push|pop|shift|unshift|splice|sort|reverse|fill/i.test(callee) ||
           /write|delete|update|insert|execute/i.test(callee);
  }

  hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex').substring(0, 16);
  }

  manageCacheSize() {
    if (this.astCache.size >= this.options.maxCacheSize) {
      // Remove oldest 10%
      const toRemove = Math.floor(this.options.maxCacheSize * 0.1);
      const keys = Array.from(this.astCache.keys()).slice(0, toRemove);
      keys.forEach(key => this.astCache.delete(key));
    }
  }

  indexByStructure(entry) {
    const key = `${entry.structure.functions.length}-${entry.structure.classes.length}`;
    if (!this.structureIndex.has(key)) {
      this.structureIndex.set(key, []);
    }
    this.structureIndex.get(key).push(entry.hash);
  }

  indexByPatterns(entry) {
    Object.entries(entry.patterns).forEach(([pattern, count]) => {
      if (count > 0) {
        if (!this.patternIndex.has(pattern)) {
          this.patternIndex.set(pattern, []);
        }
        this.patternIndex.get(pattern).push(entry.hash);
      }
    });
  }
}

// Factory function
export function createASTRetrieval(options) {
  return new ASTAwareRetrieval(options);
}

export default ASTAwareRetrieval;
