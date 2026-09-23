# Sentinel eval harness

Three layers, cheapest first — adopted from SWE-bench, terminal-bench,
Inspect AI, and the Sep 2026 harness-engineering literature
(Anthropic "Demystifying evals", Google "Anatomy of Harness Engineering",
LangChain "Improving Deep Agents", OpenAI "Harness engineering").

## Layer 1 — offline capability gates (no key, seconds)

```bash
npm run bench          # 14 tool-capability gates (scripts/bench-swe-mini.js)
```

## Layer 2 — task oracles (no key, CI-gated)

```bash
npm run eval:check              # validate all task fixtures + graders
node evals/run.mjs --check --task off-by-one-in-sum
```

Task layout (`evals/tasks/<id>/`):

| File | Purpose |
|---|---|
| `prompt.md` | Instruction given to the agent |
| `fixture/` or `workspace/` | Pristine starting state |
| `solution/` | Reference fix (fix tasks; proves solvability) |
| `grade.mjs` | `grade(workdir) → {pass, detail}`, Node-only (runs on Windows CI too) |
| `meta.json` | `{id, mode, kind: fix\|behavioral, oracle?}` |

`--check` enforces the SWE-smith mutation gate: pristine fixture must FAIL,
reference solution must PASS, behavioral tasks must PASS pristine.

## Layer 3 — agent runs (needs key)

```bash
node evals/run.mjs --agent --model gpt-6-luna
node evals/run.mjs --agent --model claude-opus-5-5 --task missing-module-crash
```

Runs each task serially in a fresh workspace copy (the tool sandbox binds
`process.cwd()`, so parallelism needs worker processes — future work).
Writes `evals/results/<runId>/{report.json,<task>.jsonl}` with pass@1,
token cost, and latency. Every run also records a JSONL trajectory;
read them to find the next task (Arize loop: trace → eval → inspect →
improve).

## Trajectories

`runAgentTurn` records every turn to `.sentinel/trajectories/<runId>.jsonl`
(OTel-flavored: runId = trace id, per-event seq). Disable with
`SENTINEL_NO_TRAJECTORY=1`, re-root with `SENTINEL_TRAJECTORY_DIR`.
The format maps 1:1 to OTel span events — a future
`eval export --otlp` can ship it to Langfuse / Phoenix / LangSmith
without changing producers.

## Docker

```bash
docker build -f evals/Dockerfile.eval -t sentinel-eval:check .
docker run --rm sentinel-eval:check
```

One shared image per repo (never per task); requires a running Docker
daemon (Docker Desktop on Windows). CI runs bench + eval:check natively
on ubuntu + windows instead.
