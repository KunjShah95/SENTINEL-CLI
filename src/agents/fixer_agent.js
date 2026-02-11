// Fixer Agent: Proposes corrections based on findings from the Scanner Agent
// This is a lightweight heuristic-based fixer suitable for simple JS/TS snippets.

function balanceCounts(code, openChar, closeChar) {
  const openCount = (code.split(openChar).length - 1);
  const closeCount = (code.split(closeChar).length - 1);
  return openCount - closeCount;
}

function applyMinimalFixes(code) {
  let fixed = code;
  // Balance parentheses if mismatched
  const parDiff = balanceCounts(code, '(', ')');
  if (parDiff > 0) fixed += ')'.repeat(parDiff);
  // Balance braces if mismatched
  const braceDiff = balanceCounts(code, '{', '}');
  if (braceDiff > 0) fixed += '}'.repeat(braceDiff);
  return fixed;
}

function proposeFixes(code, errors) {
  const fixedCode = applyMinimalFixes(code);
  const proposals = (errors || []).map((err, idx) => {
    const desc = `Proposed fix for ${err.type || 'Error'}${err.line ? ` at line ${err.line}` : ''}: ${err.message}`;
    // Simple preview of the tail of fixed code to help the user decide
    const preview = fixedCode.slice(-200);
    return { id: idx + 1, description: desc, patchPreview: preview };
  });
  return { fixedCode, proposals };
}

export { proposeFixes };
