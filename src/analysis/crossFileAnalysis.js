import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Cross-File Analysis - Trace dependencies, impact analysis, and data flow tracking
 */
export class CrossFileAnalysis {
  constructor(projectPath = process.cwd(), codeGraph = null) {
    this.projectPath = projectPath;
    this.codeGraph = codeGraph;
    this.dependencyGraph = new Map();
    this.importMap = new Map();
    this.exportMap = new Map();
  }

  /**
   * Build dependency graph if not provided
   */
  async buildDependencyGraph() {
    if (this.codeGraph && this.codeGraph.nodes) {
      return this.codeGraph;
    }

    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    for (const file of files) {
      const filePath = join(this.projectPath, file);
      const analysis = await this.analyzeFile(filePath, file);

      this.dependencyGraph.set(file, analysis);

      // Build import/export maps
      analysis.imports.forEach(imp => {
        if (!this.importMap.has(imp.source)) {
          this.importMap.set(imp.source, []);
        }
        this.importMap.get(imp.source).push({ file, ...imp });
      });

      analysis.exports.forEach(exp => {
        if (!this.exportMap.has(file)) {
          this.exportMap.set(file, []);
        }
        this.exportMap.get(file).push(exp);
      });
    }

    return this.dependencyGraph;
  }

  /**
   * Analyze file for imports/exports
   */
  async analyzeFile(filePath, relativePath) {
    const content = await fs.readFile(filePath, 'utf-8');

    const analysis = {
      file: relativePath,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      variables: []
    };

    try {
      const ast = babelParse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });

      traverse.default(ast, {
        ImportDeclaration(path) {
          const source = path.node.source.value;
          const resolved = this.resolveImport(source, relativePath);

          analysis.imports.push({
            source: resolved,
            originalSource: source,
            specifiers: path.node.specifiers.map(s => ({
              local: s.local.name,
              imported: s.imported?.name || 'default'
            })),
            line: path.node.loc?.start.line
          });
        },

        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            if (path.node.declaration.declarations) {
              path.node.declaration.declarations.forEach(d => {
                analysis.exports.push({
                  name: d.id.name,
                  type: 'named',
                  kind: path.node.declaration.kind,
                  line: path.node.loc?.start.line
                });
              });
            } else if (path.node.declaration.id) {
              analysis.exports.push({
                name: path.node.declaration.id.name,
                type: 'named',
                kind: path.node.declaration.type,
                line: path.node.loc?.start.line
              });
            }
          }
        },

        ExportDefaultDeclaration(path) {
          let name = 'default';
          if (path.node.declaration.name) {
            name = path.node.declaration.name;
          } else if (path.node.declaration.id) {
            name = path.node.declaration.id.name;
          }

          analysis.exports.push({
            name,
            type: 'default',
            line: path.node.loc?.start.line
          });
        },

        FunctionDeclaration(path) {
          if (path.node.id) {
            analysis.functions.push({
              name: path.node.id.name,
              line: path.node.loc?.start.line,
              async: path.node.async,
              params: path.node.params.map(p => p.name || 'destructured')
            });
          }
        },

        ClassDeclaration(path) {
          if (path.node.id) {
            const methods = path.node.body.body
              .filter(m => m.type === 'ClassMethod')
              .map(m => ({
                name: m.key.name,
                kind: m.kind,
                static: m.static
              }));

            analysis.classes.push({
              name: path.node.id.name,
              line: path.node.loc?.start.line,
              methods
            });
          }
        }
      });
    } catch (error) {
      analysis.parseError = error.message;
    }

    return analysis;
  }

  /**
   * Resolve import path
   */
  resolveImport(source, fromFile) {
    // Handle relative imports
    if (source.startsWith('.')) {
      const fromDir = dirname(fromFile);
      const resolved = join(fromDir, source);

      // Try adding extensions
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts'];
      for (const ext of extensions) {
        const withExt = resolved.endsWith(ext) ? resolved : resolved + ext;
        if (this.dependencyGraph.has(withExt)) {
          return withExt;
        }
      }

      return resolved;
    }

    // External module
    return source;
  }

  /**
   * Trace function/class through the codebase
   */
  async trace(identifier, options = {}) {
    const {
      maxDepth = 10
    } = options;

    await this.buildDependencyGraph();

    const trace = {
      identifier,
      definitions: [],
      usages: [],
      callChain: [],
      dependencies: []
    };

    // Find definitions
    for (const [file, analysis] of this.dependencyGraph) {
      // Check functions
      const func = analysis.functions.find(f => f.name === identifier);
      if (func) {
        trace.definitions.push({
          file,
          line: func.line,
          type: 'function',
          details: func
        });
      }

      // Check classes
      const cls = analysis.classes.find(c => c.name === identifier);
      if (cls) {
        trace.definitions.push({
          file,
          line: cls.line,
          type: 'class',
          details: cls
        });
      }

      // Check exports
      const exp = analysis.exports.find(e => e.name === identifier);
      if (exp) {
        trace.definitions.push({
          file,
          line: exp.line,
          type: 'export',
          details: exp
        });
      }
    }

    // Find usages (imports)
    for (const [file, analysis] of this.dependencyGraph) {
      const imports = analysis.imports.filter(imp =>
        imp.specifiers.some(s => s.imported === identifier || s.local === identifier)
      );

      imports.forEach(imp => {
        trace.usages.push({
          file,
          line: imp.line,
          importedFrom: imp.source
        });
      });
    }

    // Build call chain
    trace.callChain = this.buildCallChain(identifier, maxDepth);

    // Find dependencies
    if (trace.definitions.length > 0) {
      const defFile = trace.definitions[0].file;
      trace.dependencies = this.getDependencies(defFile, maxDepth);
    }

    return trace;
  }

  /**
   * Build call chain
   */
  buildCallChain(identifier, maxDepth, visited = new Set()) {
    if (maxDepth === 0 || visited.has(identifier)) {
      return [];
    }

    visited.add(identifier);
    const chain = [];

    for (const [file, analysis] of this.dependencyGraph) {
      // Find where this identifier is used
      const usages = analysis.imports.filter(imp =>
        imp.specifiers.some(s => s.imported === identifier || s.local === identifier)
      );

      usages.forEach(usage => {
        const node = {
          identifier,
          file: usage.file,
          importedFrom: usage.source,
          children: []
        };

        // Recursively find what calls this file
        const callers = this.findCallers(file);
        callers.forEach(caller => {
          node.children.push(
            ...this.buildCallChain(caller, maxDepth - 1, visited)
          );
        });

        chain.push(node);
      });
    }

    return chain;
  }

  /**
   * Find callers of a file
   */
  findCallers(file) {
    const callers = [];

    for (const [importingFile, analysis] of this.dependencyGraph) {
      const imports = analysis.imports.filter(imp => imp.source === file);
      if (imports.length > 0) {
        callers.push(importingFile);
      }
    }

    return callers;
  }

  /**
   * Get dependencies of a file
   */
  getDependencies(file, maxDepth = 5, visited = new Set()) {
    if (maxDepth === 0 || visited.has(file)) {
      return [];
    }

    visited.add(file);
    const deps = [];

    const analysis = this.dependencyGraph.get(file);
    if (!analysis) return deps;

    analysis.imports.forEach(imp => {
      deps.push({
        file: imp.source,
        originalSource: imp.originalSource,
        specifiers: imp.specifiers,
        line: imp.line,
        depth: 1
      });

      // Recursively get dependencies
      const subDeps = this.getDependencies(imp.source, maxDepth - 1, visited);
      subDeps.forEach(subDep => {
        deps.push({
          ...subDep,
          depth: subDep.depth + 1
        });
      });
    });

    return deps;
  }

  /**
   * Impact analysis - what breaks if this file changes
   */
  async impactAnalysis(file) {
    await this.buildDependencyGraph();

    const impact = {
      file,
      directDependents: [],
      indirectDependents: [],
      totalImpact: 0,
      riskLevel: 'low'
    };

    // Find direct dependents
    impact.directDependents = this.findCallers(file);

    // Find indirect dependents
    const visited = new Set([file]);
    const queue = [...impact.directDependents];

    while (queue.length > 0) {
      const current = queue.shift();

      if (visited.has(current)) continue;
      visited.add(current);

      impact.indirectDependents.push(current);

      const callers = this.findCallers(current);
      queue.push(...callers);
    }

    impact.totalImpact = impact.directDependents.length + impact.indirectDependents.length;

    // Determine risk level
    if (impact.totalImpact > 20) {
      impact.riskLevel = 'critical';
    } else if (impact.totalImpact > 10) {
      impact.riskLevel = 'high';
    } else if (impact.totalImpact > 5) {
      impact.riskLevel = 'medium';
    }

    return impact;
  }

  /**
   * Find circular dependencies
   */
  async findCircularDependencies() {
    await this.buildDependencyGraph();

    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (file, path = []) => {
      if (recursionStack.has(file)) {
        const cycleStart = path.indexOf(file);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), file]);
        }
        return;
      }

      if (visited.has(file)) return;

      visited.add(file);
      recursionStack.add(file);
      path.push(file);

      const analysis = this.dependencyGraph.get(file);
      if (analysis) {
        analysis.imports.forEach(imp => {
          dfs(imp.source, [...path]);
        });
      }

      recursionStack.delete(file);
    };

    for (const file of this.dependencyGraph.keys()) {
      dfs(file);
    }

    return cycles;
  }

  /**
   * Find unused exports
   */
  async findUnusedExports() {
    await this.buildDependencyGraph();

    const unused = [];

    for (const [file, exports] of this.exportMap) {
      exports.forEach(exp => {
        // Check if this export is imported anywhere
        let isUsed = false;

        for (const [importFile, imports] of this.importMap) {
          if (importFile === file) {
            const isImported = imports.some(imp =>
              imp.specifiers.some(s => s.imported === exp.name)
            );

            if (isImported) {
              isUsed = true;
              break;
            }
          }
        }

        if (!isUsed) {
          unused.push({
            file,
            export: exp.name,
            type: exp.type,
            line: exp.line
          });
        }
      });
    }

    return unused;
  }
}

// Factory function
export function createCrossFileAnalysis(projectPath, codeGraph) {
  return new CrossFileAnalysis(projectPath, codeGraph);
}

export default CrossFileAnalysis;
