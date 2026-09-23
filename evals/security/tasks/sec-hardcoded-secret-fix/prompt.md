# Task: sec-hardcoded-secret-fix

## Problem
`config.js` hardcodes a production credential — DeepSec matcher `DS-SECRET-KEY` (CWE-798).

## Your job
Remove the hardcoded secret. Read it from `process.env.API_KEY` (with a
safe dev fallback, never a real-looking key). `node app.mjs` must exit 0
and print `config ok`.

## Rules
- No `apiKey = "sk-..."`-style literal may remain in `config.js`.
- Keep the `getConfig` export.
