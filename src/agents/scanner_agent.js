// Scanner Agent: identifies errors in code snippets
// Uses AST parsing with Babel for JavaScript/TypeScript, plus heuristic security checks

const extractLineFromError = (err) => {
  if (!err) return null;
  if (err.stack) {
    const m = err.stack.match(/:(\d+):/);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  if (typeof err.lineNumber === 'number') return err.lineNumber;
  return null;
};

let babelParser = null;

async function parseWithBabel(code, filename = 'code.js') {
  if (!babelParser) {
    try {
      const parser = await import('@babel/parser');
      babelParser = parser.parse || parser.default?.parse;
    } catch {
      return null;
    }
  }
  
  const ext = filename.split('.').pop();
  const isTypeScript = ext === 'ts' || ext === 'tsx';
  const isJsx = ext === 'jsx' || ext === 'tsx';
  
  const plugins = [];
  if (isTypeScript) plugins.push('typescript');
  if (isJsx) plugins.push('jsx');
  plugins.push('flow');
  
  try {
    return babelParser(code, {
      sourceType: 'module',
      plugins
    });
  } catch (e) {
    return null;
  }
}

function analyzeAST(ast, _code) {
  const issues = [];
  
  function getLineInfo(node) {
    if (!node?.loc) return { line: null, column: 1 };
    return {
      line: node.loc.start.line,
      column: node.loc.start.column + 1
    };
  }
  
  function checkNode(node) {
    if (!node) return;
    
    const loc = getLineInfo(node);
    
    switch (node.type) {
      case 'CallExpression':
        if (node.callee?.name === 'eval') {
          issues.push({ type: 'SecurityRisk', message: 'Usage of eval() detected', line: loc.line, severity: 'critical' });
        }
        if (node.callee?.property?.name === 'apply' && node.arguments?.length === 0) {
          issues.push({ type: 'CodeQuality', message: 'Dangerous Function.prototype.apply call with no arguments', line: loc.line, severity: 'medium' });
        }
        break;
        
      case 'MemberExpression':
        if (node.object?.name === 'process' && node.property?.name === 'env') {
          issues.push({ type: 'SecurityRisk', message: 'Access to process.env detected', line: loc.line, severity: 'low' });
        }
        break;
        
      case 'AssignmentExpression':
        if (node.left?.type === 'Identifier' && /^[A-Z_][A-Z0-9_]*$/.test(node.left.name)) {
          issues.push({ type: 'CodeQuality', message: 'Assignment to constant-style identifier', line: loc.line, severity: 'low' });
        }
        break;
        
      case 'Identifier':
        if (node.name === 'undefined' && node.parent?.type !== 'VariableDeclarator') {
          issues.push({ type: 'CodeQuality', message: 'Direct assignment to undefined', line: loc.line, severity: 'medium' });
        }
        break;
    }
    
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => {
          if (c && typeof c === 'object' && c.type) {
            c.parent = node;
            checkNode(c);
          }
        });
      } else if (child && typeof child === 'object' && child.type) {
        child.parent = node;
        checkNode(child);
      }
    }
  }
  
  if (ast?.program?.body) {
    ast.program.body.forEach(node => {
      node.parent = null;
      checkNode(node);
    });
  }
  
  return issues;
}

async function scanCode(code, options = {}) {
  const { filename = 'code.js', enableAST = true } = options;
  const errors = [];
  
  // Try AST parsing first
  if (enableAST) {
    const ast = await parseWithBabel(code, filename);
    if (ast) {
      const astIssues = analyzeAST(ast, code);
      errors.push(...astIssues);
    } else {
      // Fall back to basic syntax check
      try {
        new Function(code);
      } catch (e) {
        const line = extractLineFromError(e);
        errors.push({ type: 'SyntaxError', message: e?.message || 'Unknown syntax error', line });
      }
    }
  } else {
    // Basic syntax check
    try {
      new Function(code);
    } catch (e) {
      const line = extractLineFromError(e);
      errors.push({ type: 'SyntaxError', message: e?.message || 'Unknown syntax error', line });
    }
  }
  
  // Heuristic security checks
  if (typeof code === 'string') {
    if (/eval\s*\(/.test(code)) {
      errors.push({ type: 'SecurityRisk', message: 'Usage of eval() detected', line: null, severity: 'critical' });
    }
    
    const ghMatch = code.match(/ghp_[A-Za-z0-9_]{36,}/);
    if (ghMatch) {
      errors.push({ type: 'SecretLeak', message: 'Potential GitHub personal access token detected', line: null, severity: 'critical' });
    }
    
    const tokenPattern = /(?:b(api_key|apiKey|token|secret|password|passwd)b).*[:=].*['".]?[A-Za-z0-9_.\-/]{8,}['".]?/i;
    if (tokenPattern.test(code)) {
      errors.push({ type: 'SecretLeak', message: 'Potential secret or token detected', line: null, severity: 'high' });
    }
    
    const awsMatch = code.match(/(?:AKIA|ABIA|ACCA)[A-Z0-9]{16}/);
    if (awsMatch) {
      errors.push({ type: 'SecretLeak', message: 'Potential AWS access key detected', line: null, severity: 'critical' });
    }
    
    const privateKeyMatch = code.match(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/);
    if (privateKeyMatch) {
      errors.push({ type: 'SecretLeak', message: 'Potential private key detected', line: null, severity: 'critical' });
    }
  }
  
  return errors;
}

export { scanCode };
