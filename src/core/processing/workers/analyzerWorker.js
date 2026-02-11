import { parentPort, workerData } from 'worker_threads';

const workerId = workerData?.workerId || 0;

async function executeTask(task) {
  const { type, analyzer, file, content, options } = task;

  switch (type) {
    case 'analyze':
      return await analyzeFile(analyzer, file, content, options);
    case 'scan':
      return await scanContent(type, content, options);
    default:
      throw new Error(`Unknown task type: ${type}`);
  }
}

async function analyzeFile(analyzerName, filePath, content, _options) {
  try {
    let result;

    switch (analyzerName) {
      case 'security':
        result = await runSecurityAnalysis(content, filePath);
        break;
      case 'quality':
        result = await runQualityAnalysis(content, filePath);
        break;
      case 'bugs':
        result = await runBugAnalysis(content, filePath);
        break;
      case 'performance':
        result = await runPerformanceAnalysis(content, filePath);
        break;
      default:
        result = await runGenericAnalysis(analyzerName, content, filePath);
    }

    return {
      analyzer: analyzerName,
      file: filePath,
      issues: result.issues || [],
      stats: result.stats || {},
    };
  } catch (error) {
    return {
      analyzer: analyzerName,
      file: filePath,
      error: error.message,
      issues: [],
    };
  }
}

async function runSecurityAnalysis(content, _filePath) {
  const issues = [];
  const lines = content.split('\n');

  const securityPatterns = [
    {
      name: 'Hardcoded Password',
      pattern: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i,
      severity: 'high',
    },
    {
      name: 'SQL Injection',
      pattern: /(SELECT|INSERT|UPDATE|DELETE).*\+/gi,
      severity: 'critical',
    },
    {
      name: 'Eval Usage',
      pattern: /\beval\s*\(/g,
      severity: 'high',
    },
    {
      name: 'InnerHTML',
      pattern: /\.innerHTML\s*=/g,
      severity: 'medium',
    },
    {
      name: 'API Key',
      pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/i,
      severity: 'high',
    },
  ];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (const rule of securityPatterns) {
      if (rule.pattern.test(line)) {
        issues.push({
          type: rule.name.toLowerCase().replace(/\s+/g, '-'),
          severity: rule.severity,
          message: `Potential ${rule.name} vulnerability`,
          line: lineNum + 1,
          column: line.search(rule.pattern) + 1,
        });

        if (rule.pattern.global) {
          rule.pattern.lastIndex = 0;
        }
      }
    }
  }

  return { issues, stats: { linesAnalyzed: lines.length, issuesFound: issues.length } };
}

async function runQualityAnalysis(content, _filePath) {
  const issues = [];
  const lines = content.split('\n');

  let consoleCount = 0;
  let longLineCount = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    if (/\bconsole\.(log|warn|error|info)\s*\(/.test(line)) {
      consoleCount++;
      issues.push({
        type: 'console-statement',
        severity: 'low',
        message: 'Console statement found',
        line: lineNum + 1,
      });
    }

    if (line.length > 120) {
      longLineCount++;
      issues.push({
        type: 'line-too-long',
        severity: 'low',
        message: `Line exceeds 120 characters (${line.length})`,
        line: lineNum + 1,
      });
    }
  }

  const complexity = calculateComplexity(content);

  return {
    issues,
    stats: {
      linesAnalyzed: lines.length,
      consoleStatements: consoleCount,
      longLines: longLineCount,
      complexity,
    },
  };
}

async function runBugAnalysis(content, _filePath) {
  const issues = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    if (/if\s*\([^=]*\s*=\s*[^=]/.test(line)) {
      issues.push({
        type: 'assignment-in-condition',
        severity: 'high',
        message: 'Assignment used instead of comparison',
        line: lineNum + 1,
      });
    }

    if (/==[^=]/.test(line) && !/==[^=]/.test(line)) {
      issues.push({
        type: 'loose-equality',
        severity: 'medium',
        message: 'Use strict equality (===) instead of (==)',
        line: lineNum + 1,
      });
    }
  }

  return { issues, stats: { linesAnalyzed: lines.length, issuesFound: issues.length } };
}

async function runPerformanceAnalysis(content, _filePath) {
  const issues = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    if (/for\s*\([^)]*\+\+\s*\)/.test(line)) {
      issues.push({
        type: 'inefficient-loop',
        severity: 'low',
        message: 'Consider using reverse loop for better performance',
        line: lineNum + 1,
      });
    }

    if (/\.push\s*\(\s*.*\.push\s*\(/g.test(line)) {
      issues.push({
        type: 'nested-push',
        severity: 'low',
        message: 'Nested array push detected',
        line: lineNum + 1,
      });
    }
  }

  return { issues, stats: { linesAnalyzed: lines.length } };
}

async function runGenericAnalysis(analyzerName, content, _filePath) {
  return {
    issues: [],
    stats: { linesAnalyzed: content.split('\n').length },
  };
}

function calculateComplexity(code) {
  let complexity = 1;
  const keywords = ['if', 'else', 'for', 'while', 'case', 'catch', '?', '&&', '||'];

  for (const keyword of keywords) {
    const regex = new RegExp(keyword, 'g');
    const matches = code.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

async function scanContent(type, content, _options) {
  return { type, scanned: true, length: content.length };
}

async function main() {
  parentPort.on('message', async (message) => {
    if (message.type === 'task') {
      const { taskId, task } = message;

      try {
        const result = await executeTask(task);

        parentPort.postMessage({
          type: 'result',
          taskId,
          result,
        });
      } catch (error) {
        parentPort.postMessage({
          type: 'error',
          taskId,
          error: { message: error.message, stack: error.stack },
        });
      }
    } else if (message.type === 'shutdown') {
      parentPort.postMessage({ type: 'shutdown-complete' });
      process.exit(0);
    }
  });

  parentPort.postMessage({
    type: 'ready',
    workerId,
  });
}

main().catch(error => {
  console.error('Worker error:', error);
  process.exit(1);
});
