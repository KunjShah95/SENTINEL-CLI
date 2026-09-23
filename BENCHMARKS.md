# Sentinel Benchmarks — vs SOTA coding agents

> Honest methodology: Sentinel's **tool-capability gates** are measured locally
> (`sentinel bench`, no API key). **% resolve rates** on SWE-bench Verified /
> SWE-bench Pro require the official Docker harness + a model API key and are
> reported as *targets with a reproduction recipe*, not as self-awarded scores.

## 1. Where SOTA stands (Sept 2026, public leaderboards)

| System | SWE-bench Verified (500 tasks) | SWE-bench Pro (731 tasks) | Notes |
|---|---|---|---|
| Claude Opus 5 / Fable 5 (Claude Code) | **95–97%** | **~80%** (Pro), ~51.5% commercial set | Leads both boards; 8h+ unattended runs |
| Gemini 3.x Pro / Flash | ~77–81% | strong, below Claude | Best value frontier |
| GPT-5.x / Codex, Cursor, Auggie | ~51–85% depending on set/config | Auggie 51.8% on Pro public set | Harness + retries move numbers ±5pp |
| Open-source SWE-agent / OpenHands / mini-SWE-agent | ~66–73% | — | Best OSS reference |
| **Sentinel (this repo)** | **not yet run — see §3** | **not yet run** | Mini-gate harness: run `sentinel bench` |

Sources: swebench.com, benchlm.ai, labs.scale.com, morphllm.com leaderboards
(Sept 2026). Scores vary by harness version, retries, and reasoning effort —
always compare same-harness numbers.

## 2. Feature comparison — what actually moves SWE-bench points

| Capability (why it matters) | Claude Code | Cursor / Codex | SWE-agent / OpenHands | Sentinel **before** | Sentinel **now** |
|---|---|---|---|---|---|
| Reproduce-first workflow | ✅ | ✅ | ✅ | ❌ ("be decisive") | ✅ `sentinel swe` + SWE prompt (REPRODUCE→VERIFY→REGRESS) |
| Iteration budget ≥ 50 | ✅ (long runs) | ✅ | ✅ | ❌ 25 | ✅ 60 in SWE mode |
| Structured test results (FAIL_TO_PASS parsing) | ✅ | ✅ | ✅ | ❌ raw stdout | ✅ `runTests` (jest/pytest/mocha/TAP) |
| Multi-file atomic patches | ✅ | ✅ | ✅ | ⚠️ batchEdit only | ✅ `applyPatch` (unified diff) + batchEdit |
| Patch export (`git diff`) | ✅ | ✅ | ✅ | ❌ | ✅ via applyPatch + checkpoints + `git diff` |
| Safe undo / regression rollback | ✅ | ✅ | ✅ | ✅ checkpoints | ✅ + SWE REGRESS gate (`isFixAccepted`) |
| Full tool-call history (no lossy summary) | ✅ | ✅ | ✅ | ❌ collapsed to "[tool ran]" | ✅ preserved verbatim in SWE mode |
| Test-gated acceptance (no test edit cheating) | ✅ | ✅ | ✅ | ❌ | ✅ prompt rule + `isFixAccepted` helper |
| Offline capability harness | — | — | ✅ | ❌ | ✅ `sentinel bench` (15 gates, no key) |
| Official % score | ✅ published | ✅ published | ✅ published | ❌ | ❌ yet — recipe in §3 |

Net: Sentinel closed **8 of 9** functional gaps vs the OSS SOTA pattern.
The remaining gap is *measured %*, which can only be earned by running the
official harness — it cannot be claimed from an offline gate suite.

## 3. How to get a real SWE-bench number for Sentinel (reproducible)

SWE-mini passing 15/15 does **not** equal "X% on SWE-bench". To benchmark:

```bash
# 1. Capability gates (no key, seconds) — must be 15/15 first
sentinel bench
# or: node scripts/bench-swe-mini.js

# 2. Official harness (needs Docker + API key, hours)
git clone https://github.com/SWE-bench/SWE-bench.git
cd SWE-bench
# Run Sentinel as the agent behind the harness: expose
#   sentinel swe "<problem statement + FAIL_TO_PASS list>"
# as the model-patch command, then:
python -m swebench.harness.run_evaluation \
  --dataset SWE-bench/SWE-bench_Verified \
  --model sentinel-swe --max-workers 4
```

Report: `% resolved`, harness version, model id, retries, temperature.
Until that run exists, any % claim for Sentinel is unverified — this file
will be updated with the run log when it does.

## 4. What changed in this upgrade (for reviewers)

- `src/agent/swe.js` (new): SWE prompt, `parseTestOutput`, `isFixAccepted`, budgets.
- `src/shared/tools/index.js`: `runTests` (structured), `applyPatch` (unified diff), `codeMap` (symbol map).
- `src/agent/loop.js`: 60-iteration SWE mode, verbatim tool history, 30k result cap, `trimMessagesForBudget` (200k-char request bound).
- `src/agent/providers.js`: Gemini replays tool calls/results via adapter (was dropped), SSE trailing-frame flush, Anthropic `max_tokens` 4096→8192.
- `src/shared/tools/checkpoint.js`: manifest relatives sanitized on undo/redo (no `../` escape).
- `src/agent/prompt.js` + `src/shared/schemas/mode.js`: first-class `SWE` mode.
- `src/cli/main.js`: `sentinel swe "…"` and `sentinel bench`.
- `scripts/bench-swe-mini.js`: 15-gate offline harness.
- `__tests__/swe-workflow.test.js`: 13 unit tests for the gates.
- `__tests__/providers.test.js` (new): SSE flush, Gemini tool replay, Anthropic budget, adapter round-trips.

## 5. Limitations (read before citing this file)

- SWE-mini tests *tools*, not *model reasoning*. A strong model + weak tools
  fails; strong tools + weak model also fails. Real score = tools × model × harness.
- Official SWE-bench needs Python repos + Docker; Sentinel's JS-native tests
  are a proxy, not a substitute.
- Do not present SWE-mini 15/15 as "beats Claude Code". Present it as
  "has the tool prerequisites to be benchmarked fairly".
