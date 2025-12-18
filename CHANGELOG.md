# Changelog

All notable changes to Sentinel CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2024-12-18

### 🚀 New Features

#### Preset Commands
- **`sentinel security-audit`** - Comprehensive security scan (security + API + secrets + dependency)
- **`sentinel full-scan`** - Run all 11 analyzers with optional history saving
- **`sentinel pre-commit`** - Quick staged files check with `--block` option
- **`sentinel frontend`** - Frontend-focused analysis (React + TypeScript + Accessibility)
- **`sentinel backend`** - Backend-focused analysis (Security + API + Performance)

#### New Analyzers
- **TypeScriptAnalyzer** - Detects `any` types, @ts-ignore, @ts-nocheck, non-null assertions
- **ReactAnalyzer** - Hooks rules violations, missing keys, index-as-key, dangerouslySetInnerHTML
- **APISecurityAnalyzer** - CORS misconfiguration, JWT issues, rate limiting, disabled SSL
- **EnvSecurityAnalyzer** - Exposed API keys, passwords, tokens, private keys, high-entropy strings
- **CustomAnalyzer** - User-defined regex rules via `.sentinelrules.yaml`

#### Integrations
- **GitHub PR Integration** - Post reviews directly to PRs with `sentinel review-pr <url>`
- **Slack Notifications** - Send analysis results to Slack with `sentinel notify --slack`
- **Discord Notifications** - Send analysis results to Discord with `sentinel notify --discord`
- **SARIF Output** - GitHub Security tab integration with `sentinel sarif`

#### Analytics
- **Trend Tracking** - Track historical analysis trends with `sentinel trends --save`
- **Git Blame Integration** - Identify issue authors with `sentinel blame`

#### CLI Improvements
- **`sentinel list-analyzers`** - View all available analyzers with descriptions
- **`--analyzers` flag** - Specify which analyzers to run: `--analyzers security,typescript,react`
- **`--all-analyzers` flag** - Enable all available analyzers
- **`--save-history` flag** - Save analysis to trend history
- **`--format sarif`** - Direct SARIF output from analyze command

### 🔧 Improvements

#### Dependency Analyzer
- Real-time CVE detection via `npm audit` integration
- Automatic fallback to static checks if npm audit unavailable

#### Interactive Chat
- `:load` command to load last analysis for context
- `:explain` command to discuss issues with AI context

#### Docker
- Updated to v1.3.0 with all new features
- Added CI-specific image target
- Added services for security-audit, full-scan, sarif, pr-review, notify

### 📦 NPM Scripts
- `npm run security` - Run security audit
- `npm run full-scan` - Run all analyzers
- `npm run frontend` - Frontend analysis
- `npm run backend` - Backend analysis
- `npm run pre-commit` - Pre-commit check (blocking)

### 📝 Documentation
- Updated README with all new features
- Updated command_guide.md with preset commands
- New CHANGELOG.md for release notes
- Updated .env.example with new environment variables

---

## [1.2.2] - 2024-12-15

### Added
- Accessibility analyzer (WCAG compliance)
- Dependency analyzer with known CVE database
- Multi-LLM support (OpenAI, Groq, Gemini, Anthropic, OpenRouter)

### Improved
- Performance optimizations for large codebases
- Better error messages and suggestions

---

## [1.2.0] - 2024-12-10

### Added
- AI-powered code analysis
- Interactive chat console (`sentinel chat`)
- HTML and Markdown report formats
- Pre-commit hook installation

### Improved
- Parallel analysis execution
- Caching for AI responses

---

## [1.1.0] - 2024-12-01

### Added
- Security analyzer
- Quality analyzer
- Bug detection analyzer
- Performance analyzer

### Improved
- CLI banners and formatting
- JSON output format

---

## [1.0.0] - 2024-11-15

### Initial Release
- Core analysis framework
- Basic security scanning
- Console output
- Git integration

---

[1.3.0]: https://github.com/KunjShah95/Sentinel-CLI/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/KunjShah95/Sentinel-CLI/compare/v1.2.0...v1.2.2
[1.2.0]: https://github.com/KunjShah95/Sentinel-CLI/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/KunjShah95/Sentinel-CLI/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/KunjShah95/Sentinel-CLI/releases/tag/v1.0.0
