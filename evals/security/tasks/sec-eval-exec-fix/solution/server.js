const OPS = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
};

export function runQuery(expr) {
  // Fixed: allowlisted operations only, no dynamic code execution.
  if (typeof expr !== 'string') throw new Error('invalid query');
  const [op, a, b] = expr.trim().split(/\s+/);
  const fn = OPS[op];
  if (!fn) throw new Error('unsupported operation');
  return fn(Number(a), Number(b));
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  console.log('ok');
}
