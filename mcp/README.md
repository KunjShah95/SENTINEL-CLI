# 🛡️ Sentinel MCP Server

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Sentinel CLI](https://img.shields.io/badge/Sentinel-CLI-green)](https://github.com/KunjShah95/SENTINEL-CLI)

Extend your AI assistant with professional-grade security and code quality analysis. The Sentinel MCP server exposes the full power of the Sentinel CLI as native tools for Cursor, Claude Code, Codex, and Continue.

## ⚡ Quick Install

To use Sentinel, ensure you have the [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI) installed in your project root.

### 🟦 Cursor
Add the following to your `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["/path/to/your/project/mcp/sentinel-mcp-server.js"]
    }
  }
}
```

### 🟧 Claude Code
Run the following command in your terminal:
```bash
claude add mcp sentinel node /path/to/your/project/mcp/sentinel-mcp-server.js
```

### 🟪 Codex
Run the following command in your terminal:
```bash
codex mcp add sentinel node /path/to/your/project/mcp/sentinel-mcp-server.js
```

### 🟩 Continue
Add to your `~/.continue/config.json` under `mcpServers`:
```json
{
  "mcpServers": [
    {
      "name": "sentinel",
      "command": "node",
      "args": ["/path/to/your/project/mcp/sentinel-mcp-server.js"]
    }
  ]
}
```

---

## 🛠️ Tool Reference

| Tool | Description | Best Use Case |
| :--- | :--- | :--- |
| `analyze` | Full-suite scan of files or directories | General review or auditing a new module |
| `security-audit` | Focused security scan (XSS, SQLi, CSRF, Secrets) | Hardening code before production |
| `review-code` | Analyze a raw code snippet without saving to file | Immediate feedback on pasted code |
| `review-pr` | Analyze only changes between current and base branch | Pre-merge verification (noise-free) |
| `explain-issue` | Deep dive into a specific rule with OWASP/CWE ref | Learning why a finding is dangerous |
| `fix` | Apply automatic fixes for common issues | Rapidly cleaning up lint/security noise |
| `score` | Calculate overall project health (0-100) | Tracking security posture over time |
| `check-dependencies` | Scan for known CVEs and license issues | Managing supply chain risk (`npm audit`+) |
| `health` | Comprehensive system and project health check | Routine maintenance and baseline audit |
| `detect-project` | Analyze project structure and tech stack | Auto-configuring the best analysis suite |

---

## 🏗️ Harness Templates

Sentinel provides **Harness Templates** to streamline analysis based on your project type. Instead of manually picking analyzers, the AI can launch a pre-configured "Harness" optimized for your stack:

### Common Templates
- **Node.js API**: 🛡️ `security` $\rightarrow$ `api` $\rightarrow$ `secrets` $\rightarrow$ `dependency`
- **React SPA**: 🎨 `accessibility` $\rightarrow$ `react` $\rightarrow$ `typescript` $\rightarrow$ `security`
- **K8s Microservice**: ☸️ `kubernetes` $\rightarrow$ `docker` $\rightarrow$ `security` $\rightarrow$ `performance`
- **Python Data Suite**: 🐍 `bugs` $\rightarrow$ `security` $\rightarrow$ `performance`

**How to use:**
Ask your AI: *"Run the Node.js API harness on the `/src` folder"* or *"Check this React project using the SPA template."*

---

## 📖 Resources
- **Rules List**: Access `sentinel://rules` via your MCP client to see all active detection patterns.
- **Config**: Access `sentinel://config` to view your current `.sentinel.json` settings.
