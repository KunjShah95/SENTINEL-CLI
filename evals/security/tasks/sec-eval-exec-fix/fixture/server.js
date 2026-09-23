export function runQuery(expr) {
  // VULNERABLE: dynamic code execution on untrusted input (CWE-95)
  return eval(expr);
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  console.log('ok');
}
