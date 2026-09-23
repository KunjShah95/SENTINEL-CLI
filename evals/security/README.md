# Security evals — DeepSec + OWASP + others

Two harnesses, one pattern. Both reuse the existing triplet convention
(`prompt.md + fixture/ + solution/ + grade.mjs + meta.json`) and the
trajectory JSONL in `src/agent/trajectory.js:50`.

## Layout

```
evals/security/
  scenarios/*.yaml        OWASP scenario library (goal_hijack, prompt_injection)
  assertions.mjs          no_denied_tool_call, goal_integrity, memory_isolation, no_external_recipient
  scenarios.mjs           YAML/JSON loader + scenarioPrompt() (untrusted ctx marked, DATA-only rule)
  trace.mjs               trajectory JSONL -> OWASP trace; live events -> trace
  owasp-target.mjs        Sentinel as OWASP live target (in-process + POST /run server)
  deepsec.mjs             regex scan + investigator prompt + SARIF export
  run-security.mjs        unified runner (--check / --owasp / --deepsec-scan)
  tasks/sec-*/            fix tasks with oracle gates (run via evals/run.mjs --check)
scripts/bench-security-mini.js   offline gates, no key (sentinel bench:security)
```

## Quick start (no key)

```bash
node evals/security/run-security.mjs --check
node scripts/bench-security-mini.js
npm run eval:security   # both
```

## OWASP live run (needs key)

```bash
node evals/security/run-security.mjs --owasp --exit-on-fail --out result.json --junit-out result.xml
node evals/security/run-security.mjs --owasp --model openai/gpt-oss-20b --scenario goal_hijack.basic_001
```

Drive from Python `agent-harness` (OWASP repo) without Node changes:

```bash
node -e "import('./evals/security/owasp-target.mjs').then(m => m.serveHttpTarget({port: 8000}))"
agent-harness run scenarios/goal_hijack/basic.yaml --live --target-url http://127.0.0.1:8000/run --exit-on-fail
```

## DeepSec (Vercel Labs)

Free scan first (no key, runs here):

```bash
node evals/security/run-security.mjs --deepsec-scan --dir . --sarif-out deepsec.sarif
```

Full harness (needs key + network, runs upstream CLI):

```bash
npx deepsec init --max-cost-usd 100 --max-duration 2h
npx deepsec scan && npx deepsec process && npx deepsec revalidate
npx deepsec export --format md-dir --out ./findings
```

Sentinel-as-investigator: `investigatorPrompt(candidate)` in `deepsec.mjs:60`
builds the per-file prompt for `sentinel ask -b`. Keep `.deepsec/` gitignored,
treat findings as untrusted input (prompt-injection via vendored code).

## Other harnesses

- `garak` (NVIDIA): use `--deepsec-scan` candidates as seed probes; run
  `garak --model_type rest --rest_endpoint http://127.0.0.1:8000/run` against
  the OWASP HTTP target above for prompt-injection/jailbreak probes.
- `promptfoo`: map OWASP LLM01–LLM10 to redteam asserts; point the provider
  at `sentinel ask` and reuse `scenarios/*.yaml` prompts.
- `CyberSecEval2 / HarmBench / secllmleaderboard`: leaderboard-only for now;
  export `report.json` from `--owasp` and compare same-harness numbers.

## CI

`npm run eval:security` (oracle + bench) runs on ubuntu + windows, Node 20/22.
`--owasp` live runs are manual (need key) — same split as `BENCHMARKS.md`
offline gates vs official harness.
