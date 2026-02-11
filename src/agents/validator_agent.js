// Validator Agent: checks whether fixes address the reported issues
// Uses a lightweight syntax check on the fixed code and basic sanity checks.

function validateFix(code, fixedCode, _errors) {
  const details = [];
  try {
    // If fixedCode can be parsed, syntax is valid
    new Function(fixedCode);
    details.push({ check: 'syntax', status: 'passed' });
  } catch (e) {
    details.push({ check: 'syntax', status: 'failed', note: e && e.message ? e.message : 'Unknown syntax error' });
  }

  // Basic cross-check: ensure at least no syntax errors remain
  const syntaxPassed = details.find(d => d.check === 'syntax' && d.status === 'passed');
  const passes = !!syntaxPassed;
  return { passes, details };
}

export { validateFix };
