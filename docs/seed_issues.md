# 🛡️ Seed Issues for Sentinel's AI-Powered Guardian System

To keep Sentinel's OSS health metrics strong, it's essential to have a stable pool of 5–30 open issues. Use these as "seed" issues to copy-paste into the GitHub repository.

---

## Issue 1: [Good First Issue] Implement `sentinel --version` in the modern TUI
**Label**: `good first issue`, `enhancement`
**Context**: The `--version` flag currently reports the semantic version but lacks the styling applied in `src/tui/modernTui.js`.
**Requirement**: Add a fancy `Figlet` or `chalk` styling to the version output when run in interactive terminals.
**Difficulty**: 1/5

---

## Issue 2: [Help Wanted] Support for AWS SDK v3 in the Security Analyzer
**Label**: `help wanted`, `security`, `analyzer`
**Context**: `src/analyzers/securityAnalyzer.js` detects AWS Secrets Manager V2 patterns but lacks coverage for newer V3 SDK patterns.
**Requirement**: Add regex patterns for modern AWS credential patterns (`ASIA...`, `AKIA...`) used in SDK v3.
**Difficulty**: 2/5

---

## Issue 3: [Roadmap] Deep GitHub Actions PR/Issue Integration (Phase 1)
**Label**: `roadmap`, `priority:high`, `integration`
**Context**: Native understanding of GitHub event context: inline PR review comments and auto-creating GitHub Issues for critical findings.
**Requirement**: Implement the `Event-to-action routing` via the shared handler engine in `src/integrations/githubAutomationHandlers.js`.
**Difficulty**: 4/5

---

## Issue 4: [Bug] Incremental Analysis fails on newly created files
**Label**: `bug`, `priority:medium`
**Context**: `sentinel analyze --incremental` uses the `lastModified` timestamp from the `.sentinel_cache.json` but doesn't always pick up files created *since* the last run if no cache entry exists.
**Requirement**: Ensure newly created files are always included in the scan regardless of cache status.
**Difficulty**: 3/5

---

## Issue 5: [Task] Improve Global Test Coverage to 10%
**Label**: `task`, `testing`, `good first issue`
**Context**: Global Jest coverage is currently ~3.6%. We need to reach 10% in the first milestone.
**Requirement**: Add unit tests for `src/utils/configManager.js` and `src/utils/logger.js`.
**Difficulty**: 1/5

---

## Issue 6: [Feature Request] Export results to SARIF for GitHub Security Dashboards
**Label**: `enhancement`, `security`, `integration`
**Context**: Most security tools on GitHub use SARIF (Static Analysis Results Interchange Format) to surface findings in the "Security" tab.
**Requirement**: Implement a `sentinel sarif` command that converts the internal JSON results format to standard SARIF 2.1.0.
**Difficulty**: 3/5

---

## Issue 7: [Good First Issue] Add labels to standard console output
**Label**: `good first issue`, `ux`
**Context**: Current console output shows `CRITICAL`, `HIGH`, etc. but doesn't label them with "Category" (e.g., [Security], [Quality]).
**Requirement**: Prepend the analyzer category to the issue description for better clarity.
**Difficulty**: 1/5
