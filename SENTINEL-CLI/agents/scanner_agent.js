// Scanner Agent: identifies errors in code snippets
// Attempts to leverage a lightweight syntax check and optional Google Vertex AI integration if available.

const extractLineFromError = (err) => {
  if (!err) return null;
  // Typical Node.js stack trace format: at <anonymous>:LINE:COL
  if (err.stack) {
    const m = err.stack.match(/:(\d+):\d+/);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  if (typeof err.lineNumber === 'number') return err.lineNumber;
  return null;
};

async function scanCode(code) {
  const errors = [];
  // Basic syntax check by attempting to construct a function
  try {
    // eslint-disable-next-line no-new, no-unused-vars
    new Function(code);
  } catch (e) {
    const line = extractLineFromError(e);
    errors.push({ type: 'SyntaxError', message: e && e.message ? e.message : 'Unknown syntax error', line: line });
  }

  // Heuristic: warn about potential risky constructs
  if (typeof code === 'string' && /eval\s*\(/.test(code)) {
    errors.push({ type: 'SecurityRisk', message: 'Usage of eval() detected', line: null });
  }

  // Heuristic: detect potential secrets (e.g., GitHub personal access tokens)
  try {
    if (typeof code === 'string') {
      // GitHub token pattern (ghp_ followed by 36+ alphanumeric chars)
      const ghMatch = code.match(/ghp_[A-Za-z0-9_]{36,}/);
      if (ghMatch) {
        errors.push({ type: 'SecretLeak', message: 'Potential GitHub personal access token detected', line: null, severity: 'critical' });
      }

      // Generic token/secret pattern (looks for common keywords followed by an assignment)
      const tokenPattern = /(?:\b(api_key|apiKey|token|secret|password|passwd)\b)\s*[:=]\s*['\"]?[A-Za-z0-9\-_.\\/]{8,}['\"]?/i;
      if (tokenPattern.test(code)) {
        errors.push({ type: 'SecretLeak', message: 'Potential secret or token detected', line: null, severity: 'high' });
      }
    }
  } catch (e) {
    // Non-fatal detection error; continue
  }

  // Optional Google Vertex AI integration (best-effort, non-blocking)
  try {
    // Lazy load to avoid hard dependency
    // Some environments may provide a google AI SDK via google-ai-sdk
    const googleAi = (() => {
      try {
        // eslint-disable-next-line import/no-extraneous-dependencies
        return require('google-ai-sdk');
      } catch (err) {
        return null;
      }
    })();
    if (googleAi && typeof googleAi.analyzeCode === 'function') {
      const res = await googleAi.analyzeCode(code);
      if (Array.isArray(res)) {
        res.forEach((r) => {
          errors.push({ type: r.type || 'GoogleAI', message: r.message || 'Google AI analysis', line: r.line || null });
        });
      }
    }
  } catch {
    // Ignore any integration failures
  }

  return errors;
}

export { scanCode };
