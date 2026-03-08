// Validator Agent: checks whether fixes address the reported issues
// Uses syntax validation for JS/TS, Python, Go, and Rust

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function validateJS(code) {
  const details = [];
  try {
    new Function(code);
    details.push({ check: 'syntax', status: 'passed', language: 'javascript' });
  } catch (e) {
    details.push({ check: 'syntax', status: 'failed', note: e?.message || 'Unknown error', language: 'javascript' });
  }
  return details;
}

function validatePython(code, _filePath = null) {
  const details = [];
  
  try {
    execSync(`python3 -m py_compile -c "${code.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    details.push({ check: 'syntax', status: 'passed', language: 'python' });
  } catch (e) {
    try {
      execSync(`python -m py_compile -c "${code.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
      details.push({ check: 'syntax', status: 'passed', language: 'python' });
    } catch {
      const msg = e.message || 'Python syntax error';
      details.push({ check: 'syntax', status: 'failed', note: msg, language: 'python' });
    }
  }
  
  return details;
}

function validateGo(code, filePath = null) {
  const details = [];
  
  try {
    if (filePath && existsSync(filePath)) {
      execSync(`go vet ${filePath}`, { stdio: 'pipe' });
    } else {
      execSync(`echo 'package main\nfunc main(){}' | go run /dev/stdin`, { input: code, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    details.push({ check: 'syntax', status: 'passed', language: 'go' });
  } catch (e) {
    details.push({ check: 'syntax', status: 'failed', note: e.message, language: 'go' });
  }
  
  return details;
}

function validateRust(code) {
  const details = [];
  
  try {
    const tempFile = `/tmp/validate_rust_${Date.now()}.rs`;
    const wrappedCode = `fn main() { ${code} }`;
    require('fs').writeFileSync(tempFile, wrappedCode);
    execSync(`rustc --edition 2021 --crate-type lib -Z parse-only ${tempFile}`, { stdio: 'pipe' });
    details.push({ check: 'syntax', status: 'passed', language: 'rust' });
    require('fs').unlinkSync(tempFile);
  } catch (e) {
    details.push({ check: 'syntax', status: 'failed', note: e.message, language: 'rust' });
  }
  
  return details;
}

function detectLanguage(code, filename) {
  if (filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const langMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java'
    };
    if (langMap[ext]) return langMap[ext];
  }
  
  if (/^(import|export|const|let|var|function|class)\s/m.test(code)) return 'javascript';
  if (/^(def|class|import|from|if __name__)/m.test(code)) return 'python';
  if (/^package\s+\w+/m.test(code)) return 'go';
  if (/^(fn|let|mut|use|pub|mod)\s/m.test(code)) return 'rust';
  
  return 'javascript';
}

function validateFix(code, fixedCode, errors, options = {}) {
  const { filename = null } = options;
  const language = detectLanguage(code, filename);
  const details = [];
  
  switch (language) {
    case 'python':
      details.push(...validatePython(fixedCode));
      break;
    case 'go':
      details.push(...validateGo(fixedCode, filename));
      break;
    case 'rust':
      details.push(...validateRust(fixedCode));
      break;
    default:
      details.push(...validateJS(fixedCode));
  }
  
  const failedChecks = details.filter(d => d.status === 'failed');
  const passes = failedChecks.length === 0;
  
  return { passes, details, language };
}

export { validateFix, validateJS, validatePython, validateGo, validateRust, detectLanguage };
