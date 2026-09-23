# Coding Agents — Full Landscape vs Sentinel (Sept 2026)

Scores are vendor- or leaderboard-reported, same-harness comparisons only.
SWE-bench Verified has known contamination issues (OpenAI stopped reporting
it Feb 2026) — treat 90%+ numbers as harness+model+retrieval bundles, not
pure model intelligence. See §4 for benchmark families.

## 1. Terminal agents (Sentinel's direct category)

| Agent | Vendor | Open? | Price | SWE-bench Verified* | Terminal / autonomy notes |
|---|---|---|---|---|---|
| Claude Code | Anthropic | Closed | Subscription + usage | **~95%** (Fable 5 / Opus 5) | Long unattended runs, strongest harness |
| OpenAI Codex CLI | OpenAI | Partial (Apache-2.0 CLI) | Usage | High (leads Terminal-Bench) | Sandbox + cloud tasks |
| Gemini CLI | Google | OSS (Apache-2.0) | Free tier + usage | Below frontier | 1M ctx, Google-grounded |
| Qwen Code | Alibaba | OSS | Varies | Strong for open weights | Qwen3-Coder based |
| Aider | OSS (Paul Gauthier) | Yes (Apache-2.0) | BYO key | ~32% (w/ Claude 4.5) | Git-native: every step committed, repo-map |
| OpenCode | SST / OSS | Yes | BYO key | — | TUI terminal agent, closest to Sentinel's niche |
| Goose | Block | Yes (Apache-2.0) | BYO key | — | MCP-first, recipes |
| **Sentinel** | This repo (MIT) | Yes | BYO key, free-tier default | Not run (see BENCHMARKS.md) | Pi-style minimal, SWE mode, offline bench |

## 2. IDE-integrated assistants

| Agent | Vendor | Interface | Price | Notes |
|---|---|---|---|---|
| Cursor | Cursor / SpaceX (acquired) | AI-first IDE + CLI | ~$20/mo | Tab + agent mode, large codebase indexing |
| GitHub Copilot | GitHub/MS | VS Code, JetBrains, CLI | ~$10/mo | Best autocomplete distribution; agent mode added |
| Windsurf → Devin Desktop | Cognition | IDE | Varies | Acquired into Devin lineup |
| Cline / Roo Code / Kilo Code | OSS community | VS Code extension | BYO key | Plan/act loop, MCP support |
| Continue | OSS | VS Code/JetBrains | BYO key | Local-model friendly |
| Tabnine | Tabnine | IDE | Freemium | Enterprise compliance focus |
| Amazon Q Developer | AWS | IDE + CLI | Free tier / Pro | AWS-context strengths |
| Gemini Code Assist | Google | IDE | Free tier | Google Cloud grounding |
| Sourcegraph Cody | Sourcegraph | IDE | Freemium | Repo-wide code search heritage |

## 3. Autonomous SWE platforms (async / full-task)

| Agent | Vendor | Open? | Verified* | Notes |
|---|---|---|---|---|
| Devin | Cognition | Closed | High (self-reported) | Full VM, PR end-to-end |
| OpenHands | OSS (research community) | Yes | ~72% (strongest full OSS platform) | Docker agents, event stream |
| SWE-agent | Princeton-led OSS | Yes | ~66% | The research baseline everyone forks |
| mini-SWE-agent | OSS | Yes | ~72.8% @ ~$0.53/run | 100-line Python agent, cost-efficiency king |
| Open SWE | OSS | Yes | — | Async coding agents |
| SWE-smith | Research tooling | Yes | — | Trains SWE models, not an agent itself |

## 4. App builders ("describe → app", different job, same buyer)

v0 (Vercel), Lovable, Bolt.new, Replit Agent — hosted, ~$20–65 per MVP build,
deploy-coupled. Not comparable on SWE-bench; compared on time-to-prototype.

## 5. Benchmark families (don't mix numbers across rows)

- **SWE-bench Verified** (500 tasks, human-filtered) — most-cited, contaminated per OpenAI 2026.
- **SWE-bench Pro** (731 tasks, Scale) — harder; top ~80%, commercial split ~51%.
- **SWE-bench Multilingual** — non-Python repos.
- **Terminal-Bench** — shell-first tasks; Codex leads here, arguably harder than Verified.
- **Live SWE-bench / SWE-Lancer** — contamination-resistant, newer.

## 6. Sentinel vs the field — honest gaps (working list)

- [x] Reproduce-first loop, 60-iter SWE mode, structured tests, unified-diff apply, undo gate
- [x] Offline capability harness (`sentinel bench`, 14 gates)
- [x] Symbol-level repo map (`codeMap` tool) — Aider repo-map / Cursor indexing equivalent, minimal form
- [ ] Real Verified/Pro % via official Docker harness (recipe in BENCHMARKS.md §3)
- [ ] Long-run reliability (multi-hour sessions, compaction already exists)
- [ ] Language-server precision (go-to-definition; currently regex symbols)
- [ ] Cloud/async execution (Devin-style VMs; out of scope for a local-first tool)

*Scores: public leaderboards Sept 2026 (swebench.com, benchlm.ai, labs.scale.com,
morphllm.com, o-mega.ai). Verify before citing — boards move weekly.
