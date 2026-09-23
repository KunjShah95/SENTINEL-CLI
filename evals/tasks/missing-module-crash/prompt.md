# Task: missing-module-crash

## Problem
A small Node CLI in this workspace crashes on startup:

```
$ node app.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module './lib/checks.mjs'
```

The entry point `app.mjs` imports `./lib/checks.mjs`, but that file was
never created. `lib/` exists and is empty.

## Your job
Make `node app.mjs` exit 0 and print exactly `checks: 6/6 passed`.

## Rules
- Do not modify `app.mjs` in a way that hardcodes the output
  (the grader re-reads `app.mjs`: it must still import `./lib/checks.mjs`
  and print whatever that module returns).
- Keep the fix minimal: create the missing module with a `runChecks()`
  function returning `{ passed: 6, total: 6 }`.
