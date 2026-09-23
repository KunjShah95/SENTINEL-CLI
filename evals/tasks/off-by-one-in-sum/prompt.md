# Task: off-by-one-in-sum

## Problem
`sum.mjs` exports `sumTo(n)`, which should return 1 + 2 + … + n.
It is off by one. `test.mjs` proves it:

```
$ node test.mjs
AssertionError: expected 15, got 10
```

## Your job
Fix `sum.mjs` so `node test.mjs` exits 0.

## Rules
- Fix the source, not the test: `test.mjs` must still assert
  `sumTo(5) === 15` and `sumTo(100) === 5050`.
- Minimal diff. No new dependencies.
