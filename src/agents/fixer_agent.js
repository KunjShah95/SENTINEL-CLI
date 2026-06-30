// Fixer Agent: Proposes corrections based on findings from the Scanner Agent
// Uses LLM for intelligent fix generation when available, plus heuristic fixes

import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';

function balanceCounts(code, openChar, closeChar) {
  const openCount = (code.split(openChar).length - 1);
  const closeCount = (code.split(closeChar).length - 1);
  return openCount - closeCount;
}

function applyMinimalFixes(code) {
  let fixed = code;
  const parDiff = balanceCounts(code, '(', ')');
  if (parDiff > 0) fixed += ')'.repeat(parDiff);
  const braceDiff = balanceCounts(code, '{', '}');
  if (braceDiff > 0) fixed += '}'.repeat(braceDiff);
  const bracketDiff = balanceCounts(code, '[', ']');
  if (bracketDiff > 0) fixed += ']'.repeat(bracketDiff);
  return fixed;
}

async function generateLLMFix(code, error, _context = {}) {
  const orchestrator = getLLMOrchestrator();

  if (!orchestrator?.providers?.length) {
    return null;
  }

  const prompt = `You are a code fixer. Given the following code and error, provide a fixed version of the code.

Error: ${error.type} - ${error.message}
${error.line ? `Line: ${error.line}` : ''}

Code:
\`\`\`
${code}
\`\`\`

Provide ONLY the fixed code without any explanation or markdown formatting. If no fix is needed, return the original code unchanged.`;

  try {
    const result = await orchestrator.chat(prompt, {
      temperature: 0.2,
      maxTokens: 4000
    });

    if (result?.text) {
      const fixed = result.text.trim();
      if (fixed.startsWith('```')) {
        return fixed.replace(/```\w*\n?/g, '').trim();
      }
      return fixed;
    }
  } catch (e) {
    console.warn('LLM fix generation failed:', e.message);
  }

  return null;
}

// Redact hardcoded secrets so the leak no longer scans positive.
// Replaces the secret literal with an env-var reference (keeps code runnable).
function redactSecret(code) {
  // Each pattern optionally consumes a wrapping quote pair (\1 backref) so a
  // quoted literal `"ghp_..."` becomes a bare `process.env.REDACTED_SECRET`
  // reference, not a string containing that text.
  const patterns = [
    /(['"`]?)ghp_[A-Za-z0-9_]{36,}\1/g,
    /(['"`]?)(?:AKIA|ABIA|ACCA)[A-Z0-9]{16}\1/g,
    /(['"`]?)-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----\1/g
  ];

  let redacted = code;
  for (const re of patterns) {
    redacted = redacted.replace(re, 'process.env.REDACTED_SECRET');
  }

  // Inline assignment: api_key = "value" -> api_key = process.env.REDACTED_SECRET
  redacted = redacted.replace(
    /\b(api_?key|apiKey|token|secret|password|passwd)\b(\s*[:=]\s*)(['"`])[A-Za-z0-9_.\-/]{8,}\3/gi,
    '$1$2process.env.REDACTED_SECRET'
  );

  return redacted;
}

async function proposeFixes(code, errors, options = {}) {
  const { useLLM = true, context = {} } = options;

  // Thread a single working copy so fixes compound instead of overwriting.
  let working = applyMinimalFixes(code);

  const proposals = [];

  for (const error of (errors || [])) {
    let fixApplied = false;
    const before = working;

    if (error.type === 'SecretLeak') {
      const redacted = redactSecret(working);
      if (redacted !== working) {
        working = redacted;
        fixApplied = true;
      }
    } else if (useLLM) {
      // Fix on the accumulated `working` copy so prior fixes are preserved.
      const llmFix = await generateLLMFix(working, error, context);
      if (llmFix && llmFix !== working) {
        working = llmFix;
        fixApplied = true;
      }
    }

    const desc = `Proposed fix for ${error.type || 'Error'}${error.line ? ` at line ${error.line}` : ''}: ${error.message}`;

    proposals.push({
      id: proposals.length + 1,
      type: error.type,
      description: desc,
      originalError: error,
      patchPreview: working.slice(-200),
      fixedCode: working,
      changed: working !== before,
      fixApplied
    });
  }

  return { fixedCode: working, proposals };
}

export { proposeFixes, applyMinimalFixes, generateLLMFix, redactSecret };
