---
name: reproduce-fix-verify
description: Fix a bug without shipping another one. Reproduce first, fix second, verify third.
argument-hint: <what to fix>
---

Follow these three phases in order. Do not skip phase 1, and do not start phase 3
before phase 2 is done.

## 1. Reproduce

Do not read the code first. Find the input that produces the wrong behaviour.

1. Run the existing test suite. If it fails, you have your reproducer.
2. If it passes, write the smallest failing test that exhibits the bug, and run
   it to confirm it fails for the reason you expect.
3. If you cannot produce a failing test, you do not have a bug you have located —
   you have a theory. Say so rather than fixing on a theory.

Record the exact failing assertion. You will need it in phase 3.

## 2. Fix

Change the code that is actually wrong.

- Fix the cause, not the symptom. If a test is failing because the logic is
  inverted, do not flip the assertion.
- Keep the diff as small as the bug allows. A bug fix that reformats a file
  cannot be reviewed.
- Re-run your failing test. It must pass now. If it does not, you have not fixed
  the cause.

## 3. Verify

1. Run the failing test again — confirm green.
2. Run the **full** suite. This is the step that separates a fix from a swap: the
   common failure is a passing test that came with three new failures.
3. If the suite is green, say so plainly. If you skipped it, say that instead —
   never report a test result you did not observe.

Close by naming the file you changed and the command whose output backs your
claim.