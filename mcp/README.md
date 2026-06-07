# Sentinel MCP Server

Expose Sentinel's 21 code analyzers as tools that any MCP-compatible AI assistant (Cursor, Claude Code, Codex, Windsurf, Continue) can call natively.

## Quick Install

### Cursor

Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "sentinel": {
      "command": "npx",
      "args": ["-y", "sentinel-cli", "mcp"]
    }
  }
}
```

### Claude Code

```bash
claude add mcp -- npx -y sentinel-cli mcp
```

### Codex

```bash
codex mcp add sentinel -- npx -y sentinel-cli mcp
```

### Continue

Add to `~/.continue/config.json`:
```json
{
  "experimental": {
    "mcpServers": {
      "sentinel": {
        "command": "npx",
        "args": ["-y", "sentinel-cli", "mcp"]
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `sentinel_analyze` | Run security analysis on files or directories |
| `sentinel_security_audit` | Full security audit of the project |
| `sentinel_review_code` | AI-powered code review |
| `sentinel_review_pr` | Review pull request changes |
| `sentinel_explain_issue` | Explain a security finding in detail |
| `sentinel_fix` | Generate automated fix for an issue |
| `sentinel_score` | Compute project health score |
| `sentinel_check_dependencies` | Check dependencies for vulnerabilities |
| `sentinel_health` | Check if Sentinel is properly installed |
| `sentinel_detect_project` | Auto-detect project type and recommend analyzers |

## Harness Templates

Use Sentinel with your AI coding agent for:

- **Security-first development**: Run `sentinel_analyze` after every edit
- **PR review automation**: Run `sentinel_review_pr` on every PR
- **Architecture enforcement**: Run `sentinel_score` to track code quality over time
- **Compliance checking**: Use compliance analyzers for OWASP, PCI-DSS, SOC 2, GDPR, HIPAA
