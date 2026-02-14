/**
 * ANALYSIS WORKER - Parallel code analysis
 *
 * Runs in separate thread for true parallelism
 */

import { parentPort, workerData } from 'worker_threads';
import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';

const { workerId } = workerData;

// Signal ready
parentPort.postMessage({ type: 'ready', workerId });

// Listen for tasks
parentPort.on('message', async (message) => {
  const { type, taskId, task } = message;

  if (type === 'execute') {
    try {
      const startTime = Date.now();

      // Execute task based on type
      const result = await executeTask(task);

      const metrics = {
        processingTime: Date.now() - startTime,
        workerId
      };

      parentPort.postMessage({
        type: 'result',
        taskId,
        result,
        metrics
      });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        taskId,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }
  }
});

/**
 * Execute task
 */
async function executeTask(task) {
  switch (task.type) {
    case 'analyze_file':
      return await analyzeFile(task.data);

    case 'generate_embedding':
      return await generateEmbedding(task.data);

    case 'check_security':
      return await checkSecurity(task.data);

    case 'trace_dependency':
      return await traceDependency(task.data);

    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

/**
 * Analyze file
 */
async function analyzeFile({ filepath, content }) {
  const analysis = {
    filepath,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    securityIssues: [],
    complexity: 0
  };

  try {
    const ast = babelParse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy']
    });

    traverse.default(ast, {
      ImportDeclaration(path) {
        analysis.imports.push({
          source: path.node.source.value,
          specifiers: path.node.specifiers.map(s => s.local.name)
        });
      },

      ExportNamedDeclaration(path) {
        if (path.node.declaration?.declarations) {
          path.node.declaration.declarations.forEach(d => {
            analysis.exports.push({ name: d.id.name, type: 'named' });
          });
        }
      },

      FunctionDeclaration(path) {
        if (path.node.id) {
          analysis.functions.push({
            name: path.node.id.name,
            line: path.node.loc?.start.line,
            complexity: calculateComplexity(path)
          });
        }
      },

      ClassDeclaration(path) {
        if (path.node.id) {
          analysis.classes.push({
            name: path.node.id.name,
            line: path.node.loc?.start.line
          });
        }
      }
    });

    // Check for security issues
    analysis.securityIssues = detectSecurityIssues(content);

  } catch (error) {
    analysis.parseError = error.message;
  }

  return analysis;
}

/**
 * Generate embedding (placeholder - use real embeddings API)
 */
async function generateEmbedding({ text }) {
  // In production: call OpenAI/Cohere/etc API
  // For now: simple hash-based vector
  const hash = Buffer.from(text).toString('base64');
  return Array.from({ length: 768 }, (_, i) =>
    (hash.charCodeAt(i % hash.length) / 255) * 2 - 1
  );
}

/**
 * Check security
 */
async function checkSecurity({ content }) {
  return detectSecurityIssues(content);
}

/**
 * Trace dependency
 */
async function traceDependency({ identifier }) {
  // Trace logic here
  return { identifier, trace: [] };
}

/**
 * Detect security issues
 */
function detectSecurityIssues(content) {
  const issues = [];

  // SQL Injection
  if (/query\s*\([^)]*\+|execute\s*\([^)]*\+/.test(content)) {
    issues.push({ type: 'sql-injection', severity: 'high' });
  }

  // XSS
  if (/innerHTML\s*=|dangerouslySetInnerHTML/.test(content)) {
    issues.push({ type: 'xss', severity: 'medium' });
  }

  // Eval
  if (/eval\s*\(|Function\s*\(/.test(content)) {
    issues.push({ type: 'eval-usage', severity: 'critical' });
  }

  // Hardcoded secrets
  if (/(api[_-]?key|secret|password)\s*=\s*['"][^'"]+['"]/.test(content)) {
    issues.push({ type: 'hardcoded-secret', severity: 'high' });
  }

  return issues;
}

/**
 * Calculate complexity
 */
function calculateComplexity(path) {
  let complexity = 1;

  path.traverse({
    IfStatement() { complexity++; },
    WhileStatement() { complexity++; },
    ForStatement() { complexity++; },
    CaseStatement() { complexity++; },
    ConditionalExpression() { complexity++; }
  });

  return complexity;
}
