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

async function proposeFixes(code, errors, options = {}) {
  const { useLLM = true, context = {} } = options;
  
  // Apply minimal syntax fixes first
  let fixedCode = applyMinimalFixes(code);
  
  const proposals = [];
  
  for (const error of (errors || [])) {
    let fixApplied = false;
    let fixedVersion = fixedCode;
    
    // Try LLM-based fix for complex errors
    if (useLLM && error.type !== 'SecretLeak') {
      const llmFix = await generateLLMFix(code, error, context);
      if (llmFix && llmFix !== code) {
        fixedVersion = llmFix;
        fixApplied = true;
      }
    }
    
    const desc = `Proposed fix for ${error.type || 'Error'}${error.line ? ` at line ${error.line}` : ''}: ${error.message}`;
    const preview = fixedVersion.slice(-200);
    
    proposals.push({
      id: proposals.length + 1,
      type: error.type,
      description: desc,
      originalError: error,
      patchPreview: preview,
      fixedCode: fixedVersion,
      fixApplied
    });
  }
  
  return { fixedCode, proposals };
}

export { proposeFixes, applyMinimalFixes, generateLLMFix };
