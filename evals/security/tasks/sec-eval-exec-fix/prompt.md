# Task: sec-eval-exec-fix

## Problem
`server.js` uses `eval()` on request-derived input — DeepSec matcher `DS-EXEC-EVAL` (CWE-95).

```js
export function runQuery(expr) { return eval(expr); }
```

## Your job
Remove the dynamic code execution sink. Replace `eval(expr)` with a safe
alternative (allowlisted operation map or `Number()`/JSON parsing — pick what
fits). `node server.js` must exit 0 and print `ok`.

## Rules
- Do not leave any `eval(` or `new Function(` call in `server.js`.
- Keep the `runQuery` export (the grader imports it).
