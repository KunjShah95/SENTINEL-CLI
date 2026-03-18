# Sentinel CLI — Product Roadmap

> This roadmap reflects the public direction of Sentinel. It is a living document — priorities shift based on community feedback, usage data, and contributor availability.
> **Want to influence the roadmap?** Open a [Feature Request](https://github.com/KunjShah95/SENTINEL-CLI/issues/new?template=feature_request.yml) or vote with 👍 on existing ones.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped |
| 🔨 | In Progress |
| 📋 | Planned |
| 💡 | Under Consideration |
| 🤝 | Good for Community Contribution |

---

## Now — v2.0 (Active Development)

### GitHub Actions Deep Integration 🔨
The biggest upcoming feature. Sentinel will natively understand the GitHub event context:

| Feature | Status | Notes |
|---------|--------|-------|
| PR diff analysis — only analyze changed lines | 🔨 | Reduces noise dramatically |
| Inline PR review comments with line numbers | ✅ | Posted via GitHub Checks API annotations |
| Auto-create GitHub Issues from critical findings | ✅ | With deduplication — won't re-open existing issues |
| PR relevance check — "Is this PR necessary?" | ✅ | Detects duplicate PRs, trivial/no-op changes |
| Link findings to existing open issues | ✅ | Confidence-scored related issue linking |
| Auto-label PRs by change type | ✅ | `security-fix`, `performance`, `breaking-change`, etc. |
| PR summary comment with security score delta | ✅ | Before/after score diff on each PR |
| Block merges on critical security findings | ✅ | Via `fail_on_error` in `action.yml` |

### Test Coverage 🔨
Current measured Jest global baseline is ~3.6% across a very broad monorepo surface. Target remains ≥80% (phased milestones: 10% → 25% → 50% → 80%).

| Area | Status |
|------|--------|
| Agent pipeline (scanner → fixer → validator) | ✅ |
| LLM orchestrator | 📋 🤝 |
| GitHub integration | 🔨 |
| Compliance scanner | ✅ |
| Jira / Slack / Discord integrations | 📋 🤝 |

### Self-Hosted CI 🔨
Sentinel now has self-hosted CI building blocks in place:

- ✅ GitHub CI + PR review intelligence workflows
- ✅ Baseline coverage gate in Jest + CI
- ✅ GitLab CI template (`.gitlab-ci.yml`)
- ✅ Azure DevOps pipeline template (`azure-pipelines.yml`)

Next sprint: enforce required checks on protected branches and add security-score delta reporting.

### Execution Queue — Next 2 Sprints

- [x] Add analyzer/category auto-labeling for PRs (`security-fix`, `perf`, `breaking-change`)
- [x] Add PR security score delta (`base` vs `head`) in review summary comment
- [x] Add unit tests for PR intelligence scoring logic (duplicate and related-issue confidence)
- [x] Add integration tests for check-run annotation payload generation
- [x] Refactor workflow intelligence to shared utility (`src/utils/prIntelligence.js`)
- [x] Add PR score history artifact for trend tracking
- [x] Auto-close resolved auto-created critical findings
- [x] Add GitHub integration test matrix for issue/PR automation handlers
- [ ] Raise global coverage gate from 3% → 10% after next analyzer test batch
- [ ] Publish contributor playbook for roadmap items marked 🤝

---

## Next — v2.1

### IDE & Editor Experience
- **VS Code Extension v2.1**: Real-time inline analysis as you type (LSP-backed)
- **JetBrains Plugin** 💡 — IntelliJ, PyCharm, WebStorm (community contribution welcome)
- **Neovim LSP integration** 💡 🤝

### New Language Support 🤝 (Community Welcome)
Current coverage: JavaScript, TypeScript, Python, Go. Planned:

| Language | Analyzer | Agent | Status |
|----------|----------|-------|--------|
| Rust | 📋 | 💡 | Open for contribution |
| Java | 📋 🤝 | ✅ | Analyzer needed |
| C# / .NET | 📋 🤝 | ✅ | Analyzer needed |
| Ruby | 💡 🤝 | ✅ | Analyzer needed |
| PHP | 💡 🤝 | 💡 | Open for contribution |
| Kotlin | 💡 | 💡 | Open for contribution |
| Swift | 💡 | 💡 | Open for contribution |

### Compliance Expansions 🤝

| Framework | Status |
|-----------|--------|
| OWASP Top 10 2021 | ✅ |
| SOC 2 Type II | ✅ |
| GDPR | ✅ |
| PCI-DSS | 📋 🤝 |
| HIPAA | 📋 🤝 |
| ISO 27001 | 📋 🤝 |
| NIST CSF | 💡 🤝 |
| CIS Benchmarks | 💡 🤝 |

---

## Future — v2.2+

### AI-Powered Review Quality
- **False positive learning** — remember when you dismiss a finding; stop showing it
- **Team-context awareness** — understand your team's naming conventions, patterns, and acceptable risks
- **Explain-like-I'm-5 mode** — simplify security explanations for junior developers
- **Fix confidence scoring** — rate AI-suggested fixes by reliability

### Deeper Git Integration
- **Historical trend analysis** — "security score over the last 6 months"
- **Blame-aware findings** — assign findings to the commit/author that introduced them
- **Pre-push hooks** with configurable severity gates
- **Monorepo support** — analyze per-package, report per-team

### Enterprise Features 💡
- **Multi-tenant SaaS mode** — team workspaces with shared config, centralized reporting
- **SSO / SAML / OIDC** for dashboard authentication
- **Findings triage workflow** — accept risk, assign to developer, track remediation
- **Audit log** — who ran what analysis, when, on which code
- **Policy as code** — define acceptable risk thresholds in `.sentinelrc.json`

### More Integrations 🤝

| Integration | Status | Notes |
|-------------|--------|-------|
| GitHub Security Advisories | 📋 | Auto-create advisories from critical findings |
| Linear | 💡 🤝 | Alternative to Jira |
| Notion | 💡 🤝 | Export reports to Notion |
| Azure DevOps | 💡 🤝 | Pipeline task + PR integration |
| GitLab CI | 💡 🤝 | GitLab-native action |
| Bitbucket Pipelines | 💡 🤝 | Atlassian stack |
| PagerDuty | 💡 | Alert on critical severity in production deployments |

### Frontend Dashboard v2
- Live analysis results streamed to the web UI (WebSocket)
- Team management and role-based views
- Findings timeline, comparison across branches
- Embeddable security badge widget

---

## What Will NOT Be Built

To stay focused, Sentinel will **not** become:
- A full SAST/DAST platform (no runtime analysis, no traffic interception)
- A secrets management vault (we detect secrets; we don't store them)
- A CI/CD orchestrator (we integrate with CI/CD tools; we don't replace them)

---

## How to Influence This Roadmap

1. **Open a feature request** — describe the problem clearly
2. **Comment on existing items** — explain your use case to raise priority
3. **Vote with 👍** — on issues you care about
4. **Submit a PR** — items marked 🤝 are explicitly open for community work

---

_Last updated: March 2026 — maintained by [@KunjShah95](https://github.com/KunjShah95)_
