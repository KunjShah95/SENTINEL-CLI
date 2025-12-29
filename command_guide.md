# Sentinel CLI - Complete Command Reference

> **Companion guide to README.md - Detailed command usage and examples**

This document provides comprehensive command reference for Sentinel CLI. For general overview and features, see [README.md](README.md).

---

## 🚀 Installation & Setup

### Installation Commands

```bash
# Install globally from npm
npm install -g sentinel-cli

# Use without installation (npx)
npx sentinel-cli analyze --staged

# From source
git clone https://github.com/KunjShah95/Sentinel-CLI.git
cd Sentinel-CLI
npm install
npm link
```

### Initial Setup

```bash
# 🔑 PRIMARY AUTHENTICATION (Recommended)
# Interactive wizard for API keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter)
sentinel auth

# Check which providers are configured
sentinel auth status

# Clear all stored credentials
sentinel auth logout

# Set a specific provider's key
sentinel auth set openai

# Install pre-commit hooks
sentinel install-hooks
```

---

## 🎯 Core Analysis Commands

### Basic Analysis

```bash
# Analyze current directory (default)
sentinel analyze

# Analyze specific files
sentinel analyze src/index.js src/bot.js

# Analyze all files recursively
sentinel analyze src/

# Analyze with file patterns
sentinel analyze "src/**/*.js" "src/**/*.ts"
```

### Git Integration

```bash
# Analyze staged changes only
sentinel analyze --staged

# Analyze specific commit
sentinel analyze --commit abc123

# Analyze branch changes
sentinel analyze --branch feature-branch

# Analyze against main branch
sentinel analyze --branch main

# Analyze diff between commits
sentinel analyze --from abc123 --to def456
```

### Output Formats

```bash
# Console output (default, rich formatting)
sentinel analyze --format console

# JSON output (for automation/CI)
sentinel analyze --format json

# HTML report (for sharing)
sentinel analyze --format html --output report.html

# Markdown report (for documentation)
sentinel analyze --format markdown --output report.md

# JUnit XML (for CI parsers)
sentinel analyze --format junit --output test-results.xml

# Save to file
sentinel analyze --output analysis-results.json

# Disable code snippets in output
sentinel analyze --no-snippets
```

---

## ⚡ Quick Preset Commands

### Pre-configured Analysis Sets

```bash
# Comprehensive security audit (security, secrets, dependency)
sentinel security-audit

# Full analysis with all 11 analyzers
sentinel full-scan
sentinel full                     # Alias for full-scan

# Frontend-focused analysis
sentinel frontend                 # React + TypeScript + Accessibility

# Backend-focused analysis
sentinel backend                  # Security + API + Performance

# Pre-commit workflow
sentinel pre-commit               # Staged files only
sentinel pre-commit --block       # Exit with error on critical issues

# Staged diff review (pre-commit friendly)
sentinel diff

# CI-friendly run
sentinel ci                       # JSON output with fail conditions
sentinel ci --fail-on high        # Exit on high severity or higher
sentinel ci --fail-on critical    # Exit only on critical issues

# Save analysis to history
sentinel full-scan --save-history
```

---

## 🔧 Analyzer Selection

### Specific Analyzer Usage

```bash
# Single analyzer
sentinel analyze --analyzers security
sentinel analyze --analyzers typescript
sentinel analyze --analyzers react

# Multiple analyzers
sentinel analyze --analyzers security,typescript
sentinel analyze --analyzers security,dependency,accessibility

# All analyzers except AI (faster, no API calls)
sentinel analyze --analyzers security,quality,bugs,performance,dependency,accessibility

# Custom analyzer combination
sentinel analyze --analyzers security,secrets,typescript,react,api
```

### Available Analyzers

| Analyzer | Command | Purpose |
|----------|---------|---------|
| `security` | `--analyzers security` | Security vulnerabilities, injection patterns |
| `secrets` | `--analyzers secrets` | API keys, passwords, tokens detection |
| `typescript` | `--analyzers typescript` | TypeScript-specific issues |
| `react` | `--analyzers react` | React/JSX patterns and hooks |
| `api` | `--analyzers api` | API security and configuration |
| `dependency` | `--analyzers dependency` | Package vulnerabilities and updates |
| `accessibility` | `--analyzers accessibility` | WCAG compliance and a11y issues |
| `quality` | `--analyzers quality` | Code maintainability and complexity |
| `bugs` | `--analyzers bugs` | Potential bugs and edge cases |
| `performance` | `--analyzers performance` | Performance issues and optimization |
| `custom` | `--analyzers custom` | Custom rules from .sentinelrules.yaml |

## 🤖 AI Model Management

### Provider Configuration

The modern way to manage providers is via the interactive **`auth`** command.

```bash
# Start interactive setup
sentinel auth

# Quick status check
sentinel auth status

# Sign out / clear keys
sentinel auth logout
```

For advanced configuration, you can edit your `.sentinel.json` file.

```json
{
  "providers": {
    "openai": { "apiKey": "sk-...", "disabled": false },
    "gemini": { "apiKey": "AI...", "disabled": false }
  },
  "agents": {
    "coder": { "model": "gpt-4o-mini", "maxTokens": 5000 }
  }
}
```

### Legacy Model Control

While `auth` is recommended, these flags still work for direct model selection:

```bash
# Set model for specific provider
sentinel analyze --model openai=gpt-4
sentinel analyze --model gemini=gemini-pro

# Configure environment variable names
sentinel analyze --env openai=OPENAI_API_KEY
```

### Environment Setup

```bash
# Single provider
export OPENAI_API_KEY="sk-..."
sentinel analyze

# Multiple providers (ensemble mode)
export OPENAI_API_KEY="sk-..."
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AI..."
sentinel analyze  # Uses all available providers

# Provider-specific analysis
export GROQ_API_KEY="gsk_..."
sentinel models --disable openai,gemini,anthropic
sentinel analyze  # Uses only Groq
```

---

## 💬 Interactive Features

### AI Assistant

```bash
# Launch interactive assistant
sentinel chat

# Ask specific question about current code
sentinel chat "What are the security issues in this code?"
sentinel chat "How can I improve the TypeScript types here?"

# Set custom persona for AI
sentinel chat --persona "You are a senior security engineer"
sentinel chat --persona "You are a performance optimization expert"

# Chat commands (when in interactive mode):
# :load     - Load last analysis report for context
# :explain  - Explain issues from loaded analysis
# :history  - View conversation history
# :exit     - Exit the console
# :help     - Show available commands
```

### Repository Statistics

```bash
# Show repository statistics
sentinel stats

# Detailed statistics
sentinel stats --detailed

# Output as JSON
sentinel stats --format json
```

---

## 🔧 Configuration & Customization

### Banner Customization

```bash
# Custom banner message
sentinel --banner-message "CI-REVIEW" analyze

# Custom font styles
sentinel --banner-font "Slant" analyze
sentinel --banner-font "Standard" analyze
sentinel --banner-font "Doom" analyze

# Custom gradient colors
sentinel --banner-gradient fire analyze
sentinel --banner-gradient aqua analyze
sentinel --banner-gradient rainbow analyze
sentinel --banner-gradient aurora analyze
sentinel --banner-gradient mono analyze

# Custom width
sentinel --banner-width 100 analyze

# Disable colors
sentinel --no-banner-color analyze

# Combine options
sentinel --banner-message "SECURITY-SCAN" --banner-gradient fire --banner-width 80 analyze
```

### Debug and Verbose Options

```bash
# Enable debug logging
SENTINEL_DEBUG=true sentinel analyze

# Verbose output
sentinel analyze --verbose

# Silent mode (no progress indicators)
sentinel analyze --silent

# Trace-level logging
SENTINEL_TRACE=true sentinel analyze
```

---

## 🔗 GitHub Integration

### PR Review Posting

```bash
# Analyze and post review to GitHub PR
sentinel review-pr https://github.com/owner/repo/pull/123

# Dry run (analyze but don't post)
sentinel review-pr https://github.com/owner/repo/pull/123 --dry-run

# Different output formats
sentinel review-pr https://github.com/owner/repo/pull/123 --format json
sentinel review-pr https://github.com/owner/repo/pull/123 --format markdown

# Custom message
sentinel review-pr https://github.com/owner/repo/pull/123 --message "Custom review message"

# Required environment variable
export GITHUB_TOKEN=your-personal-access-token

# Token with specific scopes (required):
# - repo (for private repositories)
# - public_repo (for public repositories)
```

### Git Blame Integration

```bash
# Analyze with author attribution
sentinel blame

# JSON output for automation
sentinel blame --format json --output blame-report.json

# Focus on recent commits
sentinel blame --since "1 week ago"

# Specific author
sentinel blame --author "username"
```

---

## 🛠️ Auto-Fix Capabilities

### Basic Auto-Fix

```bash
# Automatically fix common issues
sentinel fix

# Fix specific files
sentinel fix src/index.js src/utils.js

# Fix only staged files
sentinel fix --staged

# Preview fixes without applying
sentinel fix --dry-run

# Fix with verbose output
sentinel fix --verbose
```

### Selective Fix Types

```bash
# Fix specific issue types only
sentinel fix --type remove-console-log
sentinel fix --type remove-console-log,remove-debugger
sentinel fix --type missing-alt-text,trailing-whitespace

# Available fix types:
# - missing-alt-text        : Add placeholder alt to images
# - remove-console-log      : Remove console.log statements
# - remove-debugger         : Remove debugger statements
# - trailing-whitespace     : Remove trailing whitespace
# - multiple-empty-lines    : Reduce to max one empty line
# - sort-imports           : Sort and organize import statements
# - fix-jsx-indentation    : Fix JSX indentation
# - remove-unused-vars     : Remove unused variables
```

### Auto-Fix Examples

```bash
# Remove console.log statements
sentinel fix --type remove-console-log --dry-run

# Fix all whitespace issues
sentinel fix --type trailing-whitespace,multiple-empty-lines

# Fix React-specific issues
sentinel fix --type missing-alt-text --filePattern "**/*.jsx" --dry-run
```

---

## 🏢 Workspace & Monorepo Support

### Workspace Analysis

```bash
# Analyze all packages in a monorepo
sentinel analyze-workspace

# Specific output format
sentinel analyze-workspace --format json

# Save aggregated report
sentinel analyze-workspace --output workspace-report.json

# Analyze specific workspace
sentinel analyze-workspace --workspace "packages/*"

# Parallel analysis for faster results
sentinel analyze-workspace --parallel
```

### Supported Workspace Types

```bash
# npm/yarn workspaces (package.json workspaces field)
sentinel analyze-workspace

# pnpm workspaces (pnpm-workspace.yaml)
sentinel analyze-workspace

# Lerna monorepos
sentinel analyze-workspace --lerna

# Rush monorepos
sentinel analyze-workspace --rush
```

---

## 📊 Reporting & Analytics

### SARIF Output

```bash
# Generate SARIF report
sentinel sarif

# Custom output path
sentinel sarif --output security-report.sarif

# Upload to GitHub Code Scanning (requires gh CLI)
gh code-scanning upload-sarif --sarif sentinel-results.sarif

# SARIF with specific severity filter
sentinel sarif --min-severity medium
```

### Historical Trend Analysis

```bash
# Save current analysis to history
sentinel trends --save

# View trend analysis
sentinel trends

# Show more history entries
sentinel trends --limit 20

# Export trends as CSV
sentinel trends --format csv --output trends.csv

# Filter by analyzer
sentinel trends --analyzer security

# Date range analysis
sentinel trends --from "2024-01-01" --to "2024-12-31"
```

### Custom Reports

```bash
# Generate executive summary
sentinel analyze --format json | sentinel report --summary

# Security-focused report
sentinel analyze --analyzers security,secrets --format json | sentinel report --security

# Performance impact report
sentinel analyze --analyzers performance,quality --format json | sentinel report --performance
```

---

## 🔔 Notifications & Integrations

### Slack Integration

```bash
# Send to Slack
sentinel notify --slack

# Custom channel
sentinel notify --slack --channel "#security-alerts"

# With project context
sentinel notify --slack --project "MyApp" --branch "main" --commit "abc123"

# Required environment variable
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Discord Integration

```bash
# Send to Discord
sentinel notify --discord

# Custom username
sentinel notify --discord --username "Sentinel Bot"

# With project context
sentinel notify --discord --project "API-Service" --environment "production"

# Required environment variable
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Combined Notifications

```bash
# Send to multiple platforms
sentinel notify --slack --discord --project "MyApp"

# Filter by severity
sentinel notify --slack --discord --min-severity high

# Include code snippets
sentinel notify --slack --include-snippets
```

---

## 🐳 Docker Commands

### Building Images

```bash
# Build production image
docker build -t sentinel-cli .

# Build development image
docker build -f Dockerfile.dev -t sentinel-dev .

# Build with specific tag
docker build -t sentinel-cli:v1.4.0 .
```

### Running Containers

```bash
# Basic analysis
docker run --rm -v $(pwd):/workspace sentinel-cli analyze

# With environment variables
docker run --rm \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -v $(pwd):/workspace \
  sentinel-cli analyze --format json

# Development mode with volume mount
docker run -rm -v $(pwd):/app -w /app sentinel-dev npm run dev

# Specific output
docker run --rm \
  -v $(pwd):/workspace \
  sentinel-cli analyze --format html --output report.html
```

### Docker Compose

```bash
# Start services
docker-compose up

# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f sentinel

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build
```

---

## 🔍 Advanced Usage Patterns

### Batch Analysis

```bash
# Analyze multiple projects
for dir in project1 project2 project3; do
  cd $dir
  sentinel analyze --output ../reports/$dir.json
  cd ..
done

# Parallel batch analysis
find . -name "package.json" -type f | head -10 | xargs -I {} dirname {} | xargs -P 5 -I {} sh -c 'cd {} && sentinel analyze --output ../reports/$(basename {}).json'
```

### Custom Workflow Integration

```bash
# Pipeline-friendly output
sentinel analyze --staged --format json > analysis.json

# Process results with jq
cat analysis.json | jq '.issues[] | select(.severity=="critical")'

# Count issues by severity
cat analysis.json | jq '[.issues[] | .severity] | group_by(.) | map({severity: .[0], count: length})'

# Filter for specific file patterns
sentinel analyze --format json | jq '.issues[] | select(.file | test("src/security/"))'
```

### Performance Optimization

```bash
# Faster analysis (skip AI)
sentinel analyze --analyzers security,dependency,quality

# Incremental analysis (only changed files)
sentinel analyze --incremental

# Cache analysis results
SENTINEL_CACHE=true sentinel analyze

# Parallel file processing
sentinel analyze --parallel --max-parallel 8

# Memory-efficient analysis for large codebases
sentinel analyze --memory-limit 2GB
```

---

## 📝 Custom Rules Configuration

### .sentinelrules.yaml Examples

```yaml
# Basic custom rule
rules:
  - id: no-console-log
    pattern: "console\\.log"
    message: "Avoid using console.log in production"
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: "Use a proper logging library"

# Security-focused rule
  - id: no-eval
    pattern: "eval\\("
    message: "Avoid using eval() for security reasons"
    severity: error
    filePattern: "\\.(js|ts)$"
    suggestion: "Use JSON.parse() or other safe alternatives"

# Performance rule
  - id: no-innerHTML
    pattern: "\\.innerHTML\\s*="
    message: "Use textContent instead of innerHTML to prevent XSS"
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: "Use element.textContent = 'safe content'"
```

### Rule File Locations

```bash
# Project-level rules (recommended)
./.sentinelrules.yaml

# User-level rules (global)
~/.sentinelrules.yaml

# Command-specific rules
sentinel analyze --rules ./custom-rules.yaml
```

---

## 🎨 Output Customization

### Console Output Options

```bash
# Rich colored output (default)
sentinel analyze --format console

# Minimal output
sentinel analyze --format console --minimal

# Include file paths
sentinel analyze --format console --show-paths

# Color themes
sentinel analyze --theme dark
sentinel analyze --theme light
sentinel analyze --theme monokai

# Custom column widths
sentinel analyze --max-column 120
```

### File Output Options

```bash
# Pretty-printed JSON
sentinel analyze --format json --pretty

# Minified JSON
sentinel analyze --format json --minify

# Include metadata
sentinel analyze --format json --include-metadata

# Custom templates
sentinel analyze --format html --template custom.html
sentinel analyze --format markdown --template report.md
```

---

## 🧪 Testing & Validation

### Testing Commands

```bash
# Run test suite
npm test

# Watch mode for development
npm run test:watch

# Integration tests
node integration_test_runner.js

# Quality assurance tests
node test_quality.js

# Module-specific tests
node test_modules.js

# Fix verification
node verify_fix.js

# Quick functionality test
node test_file.js
```

### Validation Examples

```bash
# Validate configuration
sentinel setup --validate

# Test API connectivity
sentinel models --test-connection

# Validate custom rules
sentinel analyze --rules --validate

# Check rule syntax
sentinel analyze --dry-run --validate-rules
```

---

## 🚨 Exit Codes & Error Handling

### Standard Exit Codes

```bash
# Successful analysis (no issues)
exit 0

# Issues found (non-blocking)
exit 0

# Critical issues (with --fail-on critical)
exit 1

# High severity issues (with --fail-on high)
exit 2

# Configuration errors
exit 10

# API/Network errors
exit 11

# File system errors
exit 12
```

### Error Recovery

```bash
# Retry with exponential backoff
for i in {1..3}; do
  sentinel analyze && break
  sleep $((i * 2))
done

# Continue on non-critical errors
sentinel analyze --continue-on-error

# Timeout protection
timeout 300s sentinel analyze

# Memory cleanup on error
trap 'killall node' ERR
sentinel analyze
```

---

## 💡 Pro Tips & Best Practices

### Performance Tips

1. **Use Incremental Analysis**: `--incremental` for faster subsequent runs
2. **Parallel Processing**: `--parallel --max-parallel 8` for large codebases
3. **Cache Results**: Set `SENTINEL_CACHE=true` for repeated analysis
4. **Filter Analyzers**: Use specific `--analyzers` for focused reviews
5. **Staged Only**: Use `--staged` for pre-commit hooks

### Security Tips

1. **API Key Management**: Use environment variables, never hardcode
2. **Secrets Detection**: Always run `secrets` analyzer on new code
3. **Dependency Scanning**: Regular `dependency` analysis for CVEs
4. **Custom Rules**: Add project-specific security patterns
5. **SARIF Output**: Use for GitHub Security tab integration

### Development Tips

1. **Pre-commit Hooks**: Set up `sentinel install-hooks`
2. **CI Integration**: Use `sentinel ci --fail-on high`
3. **Custom Config**: Create `.codereviewrc.json` for project settings
4. **Regular Reviews**: Schedule automated analysis runs
5. **Trend Tracking**: Use `sentinel trends --save` for historical data

### Troubleshooting Tips

1. **Debug Mode**: Use `SENTINEL_DEBUG=true` for verbose logs
2. **File Patterns**: Verify patterns with `--filePattern`
3. **API Limits**: Check rate limits for AI providers
4. **Memory Issues**: Use `--memory-limit` for large projects
5. **Network Issues**: Configure proxy settings if needed

---

## 📚 Additional Resources

- **Main Documentation**: [README.md](README.md)
- **Configuration Reference**: Run `sentinel setup --help`
- **Examples**: Check `src/demo.js` for usage examples
- **GitHub Issues**: Report bugs and request features
- **Community**: Join discussions in GitHub Discussions

---

## 🎯 Quick Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `sentinel analyze` | Basic code analysis | `sentinel analyze src/` |
| `sentinel analyze --staged` | Analyze git changes | `sentinel analyze --staged` |
| `sentinel full-scan` | Complete analysis | `sentinel full-scan` |
| `sentinel security-audit` | Security focus | `sentinel security-audit` |
| `sentinel frontend` | React/TypeScript/a11y | `sentinel frontend` |
| `sentinel pre-commit` | Pre-commit check | `sentinel pre-commit --block` |
| `sentinel fix` | Auto-fix issues | `sentinel fix --dry-run` |
| `sentinel review-pr` | GitHub PR integration | `sentinel review-pr <url>` |
| `sentinel chat` | Interactive AI | `sentinel chat` |
| `sentinel setup` | Configuration | `sentinel setup` |
| `sentinel models` | AI provider management | `sentinel models --enable openai` |
| `sentinel notify` | Slack/Discord alerts | `sentinel notify --slack` |
| `sentinel trends` | Historical analysis | `sentinel trends --save` |
| `sentinel sarif` | SARIF output | `sentinel sarif --output report.sarif` |

---

*For more help, run `sentinel --help` or `sentinel <command> --help`*
