# Sentinel CLI Command Reference

Sentinel CLI provides a comprehensive set of 30+ commands for code analysis, AI interaction, and CI/CD integration.

## Core Analysis

| Command | Description |
|---------|-------------|
| `sentinel analyze [files...]` | Analyze files or directory |
| `sentinel analyze --staged` | Analyze git staged changes |
| `sentinel analyze --branch <name>` | Analyze branch diff |
| `sentinel analyze --analyzers security,quality,bugs` | Specific analyzers |
| `sentinel analyze --format json` | JSON output |
| `sentinel analyze --fail-on high` | Exit code on severity |

## Preset Scans

| Command | Description |
|---------|-------------|
| `sentinel security-audit` | Security + API + Secrets + Dependency |
| `sentinel full-scan` | All 20+ analyzers |
| `sentinel frontend` | React + TypeScript + Accessibility |
| `sentinel backend` | Security + API + Performance + Secrets |
| `sentinel container` | Docker + Kubernetes + Security |
| `sentinel pre-commit` | Fast pre-commit check |
| `sentinel ci` | CI-friendly with fail-on threshold |

## AI & Agents

| Command | Description |
|---------|-------------|
| `sentinel chat [prompt]` | Interactive AI assistant |
| `sentinel agents [input]` | Multi-agent analysis pipeline |
| `sentinel agents-pr <pr-url>` | Run agents and post to PR |

## Configuration

| Command | Description |
|---------|-------------|
| `sentinel auth` | Configure API keys |
| `sentinel config --list` | Show configuration |
| `sentinel config --set key=value` | Set config value |
| `sentinel models` | Manage AI providers |
| `sentinel list-analyzers` | Show available analyzers |

## Output & Reporting

| Command | Description |
|---------|-------------|
| `sentinel fix [files...]` | Auto-fix common issues |
| `sentinel fix --dry-run` | Preview fixes |
| `sentinel sarif` | Generate SARIF report |
| `sentinel notify --slack` | Send to Slack |
| `sentinel trends` | Historical trend analysis |
| `sentinel blame` | Git blame attribution |

## Integration

| Command | Description |
|---------|-------------|
| `sentinel review-pr <url>` | Post review to GitHub PR |
| `sentinel webhook` | Start webhook server |
| `sentinel install-hooks` | Install git pre-commit hooks |
| `sentinel badge` | Generate security badges |

## Utilities

| Command | Description |
|---------|-------------|
| `sentinel stats` | Repository statistics |
| `sentinel dashboard` | Web UI dashboard |
| `sentinel cache --stats` | Cache statistics |
| `sentinel cache --clear` | Clear cache |
