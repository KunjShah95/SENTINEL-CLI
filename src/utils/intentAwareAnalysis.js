import { promises as fs } from 'fs';
export class IntentAwareAnalysis {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
    this.cache = new Map();
    this.cacheTimeout = options.cacheTimeout || 3600000;
    this.intentPatterns = this.initializeIntentPatterns();
  }

  initializeIntentPatterns() {
    return {
      rateLimiting: {
        indicators: [
          /rate[_-]?limit/i,
          /throttle/i,
          /debounce/i,
          /sleep\s*\(/i,
          /delay\s*\(/i,
          /wait\s*\(/i,
          /setTimeout/,
          /backoff/i,
        ],
        falsePositives: ['performance/slow-function'],
        explanation: 'This appears to be intentional rate limiting logic'
      },
      testing: {
        indicators: [
          /describe\(/,
          /it\(/,
          /test\(/,
          /mock\(/,
          /spyOn/,
          /fixture/,
          /faker\./i,
        ],
        falsePositives: [
          'security/hardcoded-password',
          'security/api-key',
          'security/token',
          'security/credential',
        ],
        explanation: 'This appears to be test code with intentional test data'
      },
      validation: {
        indicators: [
          /validate/i,
          /sanitize/i,
          /escape/i,
          /clean/i,
          /check/i,
          /verify/i,
          /assert\(/,
        ],
        falsePositives: ['security/xss'],
        explanation: 'This appears to be validation/sanitization logic'
      },
      serialization: {
        indicators: [
          /JSON\.stringify/,
          /JSON\.parse/,
          /serialize/,
          /deserialize/,
          /encode/,
          /decode/,
          /base64/,
        ],
        falsePositives: ['security/xss', 'security/injection'],
        explanation: 'This appears to be serialization/deserialization logic'
      },
      logging: {
        indicators: [
          /console\.(log|debug|info)/,
          /logger\./i,
          /log\(/i,
          /debug\(/,
        ],
        falsePositives: ['security/verbose-logging'],
        explanation: 'This appears to be logging/debugging code'
      },
      errorHandling: {
        indicators: [
          /try\s*{/,
          /catch\s*\(/,
          /throw\s+new\s+Error/,
          /finally\s*{/,
        ],
        falsePositives: ['performance/empty-catch-block'],
        explanation: 'This appears to be error handling logic'
      },
      security: {
        indicators: [
          /crypto\./i,
          /hash\(/i,
          /encrypt/,
          /decrypt/,
          /hmac/,
          /sign\(/i,
          /verify\(/i,
          /authenticate/,
          /authorize/,
        ],
        falsePositives: ['security/weak-crypto'],
        explanation: 'This appears to be security-related code'
      },
      buildConfig: {
        indicators: [
          /webpack/,
          /vite/,
          /rollup/,
          /babel/,
          /\.config\./,
          /build\//,
          /dist\//,
        ],
        falsePositives: ['security/code-execution'],
        explanation: 'This appears to be build configuration'
      }
    };
  }

  async analyzeFunction(filePath, functionCode, issue) {
    const cacheKey = `${filePath}:${functionCode.substring(0, 50)}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let intent = await this.detectIntentWithLLM(filePath, functionCode, issue);

    if (!intent) {
      intent = this.detectIntentWithPatterns(functionCode);
    }

    const shouldSuppress = this.shouldSuppressBasedOnIntent(intent, issue);

    const result = {
      intent: intent.type,
      confidence: intent.confidence,
      explanation: intent.explanation,
      shouldSuppress,
      falsePositiveType: shouldSuppress ? intent.type : null
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  detectIntentWithPatterns(functionCode) {
    let bestMatch = { type: 'unknown', confidence: 0, explanation: '' };
    for (const [intentType, config] of Object.entries(this.intentPatterns)) {
      let matchCount = 0;

      for (const indicator of config.indicators) {
        if (indicator.test(functionCode)) {
          matchCount++;
        }
      }

      const confidence = matchCount / config.indicators.length;

      if (confidence > bestMatch.confidence && matchCount > 0) {
        bestMatch = {
          type: intentType,
          confidence: Math.min(confidence * 2, 1),
          explanation: config.explanation
        };
      }
    }

    return bestMatch;
  }

  async detectIntentWithLLM(filePath, functionCode, issue) {
    if (!this.llmClient) {
      return null;
    }

    try {
      const prompt = `Analyze this code snippet and determine its intent/purpose.
This is being analyzed by a security scanner that found: "${issue?.type || issue?.ruleId || 'unknown issue'}"

File: ${filePath}
Code:
${functionCode.substring(0, 1000)}

Respond with:
1. The likely intent (e.g., "testing", "rate-limiting", "serialization", "error-handling")
2. Confidence level (high/medium/low)
3. Brief explanation

Respond in JSON format:
{"intent": "...", "confidence": "...", "explanation": "..."}`;

      const response = await this.llmClient.complete(prompt);
      return JSON.parse(response);
    } catch (error) {
      return null;
    }
  }

  shouldSuppressBasedOnIntent(intent, issue) {
    if (intent.type === 'unknown' || intent.confidence < 0.5) {
      return false;
    }

    const intentConfig = this.intentPatterns[intent.type];
    if (!intentConfig) {
      return false;
    }

    const issueType = (issue?.type || issue?.ruleId || '').toLowerCase();

    return intentConfig.falsePositives.some(fp =>
      issueType.includes(fp.toLowerCase())
    );
  }

  async analyzeFile(filePath, issues) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const functions = this.extractFunctions(content, filePath);

      const analyzedIssues = [];

      for (const issue of issues) {
        const relevantFunction = functions.find(f =>
          f.line <= issue.line && f.endLine >= issue.line
        );

        if (relevantFunction) {
          const intentAnalysis = await this.analyzeFunction(
            filePath,
            relevantFunction.code,
            issue
          );

          analyzedIssues.push({
            ...issue,
            intentAnalysis: {
              detected: intentAnalysis.intent !== 'unknown',
              intent: intentAnalysis.intent,
              confidence: intentAnalysis.confidence,
              explanation: intentAnalysis.explanation,
              suppressedAsFalsePositive: intentAnalysis.shouldSuppress
            }
          });
        } else {
          analyzedIssues.push(issue);
        }
      }

      return analyzedIssues;
    } catch (error) {
      return issues;
    }
  }

  extractFunctions(content, _filePath) {
    const functions = [];
    const lines = content.split('\n');

    const functionPatterns = [
      /function\s+(\w+)/,
      /const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
      /(\w+)\s*:\s*(?:async\s*)?\s*\(.*?\)\s*=>/,
      /(\w+)\s*\([^)]*\)\s*{/,
      /async\s+(\w+)\s*\(/,
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of functionPatterns) {
        const match = lines[i].match(pattern);
        if (match) {
          const functionName = match[1];
          const startLine = i + 1;

          let braceCount = 0;
          let endLine = i;

          for (let j = i; j < lines.length && j < i + 100; j++) {
            braceCount += (lines[j].match(/{/g) || []).length;
            braceCount -= (lines[j].match(/}/g) || []).length;

            if (braceCount === 0 && j > i) {
              endLine = j + 1;
              break;
            }
          }

          functions.push({
            name: functionName,
            line: startLine,
            endLine,
            code: lines.slice(i, endLine).join('\n')
          });

          i = endLine - 1;
          break;
        }
      }
    }

    return functions;
  }

  async batchAnalyze(projectPath, issues) {
    const byFile = {};

    for (const issue of issues) {
      if (!byFile[issue.file]) {
        byFile[issue.file] = [];
      }
      byFile[issue.file].push(issue);
    }

    const results = [];

    for (const [file, fileIssues] of Object.entries(byFile)) {
      const analyzed = await this.analyzeFile(file, fileIssues);
      results.push(...analyzed);
    }

    const suppressed = results.filter(r => r.intentAnalysis?.suppressedAsFalsePositive);
    const kept = results.filter(r => !r.intentAnalysis?.suppressedAsFalsePositive);

    return {
      issues: kept,
      suppressedAsFalsePositive: suppressed,
      summary: {
        total: results.length,
        suppressed: suppressed.length,
        kept: kept.length,
        byIntent: this.groupByIntent(suppressed)
      }
    };
  }

  groupByIntent(issues) {
    return issues.reduce((acc, issue) => {
      const intent = issue.intentAnalysis?.intent || 'unknown';
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {});
  }

  clearCache() {
    this.cache.clear();
  }
}

export default IntentAwareAnalysis;
