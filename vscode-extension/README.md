# Sentinel AI - VSCode Extension

A powerful VSCode extension that brings the Sentinel CLI's AI-powered code analysis, security scanning, and intelligent chat capabilities directly into your editor. Like Cline, but for Sentinel.

## Features

### 🤖 AI Chat Interface
- **Interactive AI Chat**: Chat with multiple LLM providers (OpenAI, Gemini, Groq, Anthropic)
- **Context-Aware**: Automatically includes open files and selected code in chat context
- **Tool Use**: AI can read files, execute terminal commands, and modify code
- **Streaming Responses**: Real-time streaming for faster interactions
- **Chat History**: Persistent conversation history with export capability

### 🔍 Code Analysis
- **Real-time Analysis**: Automatic analysis on file save (optional)
- **15+ Analyzers**: Security, quality, bugs, performance, dependencies, accessibility
- **Inline Diagnostics**: Issues shown directly in the editor with severity indicators
- **Quick Fixes**: One-click fixes for many issues
- **Sidebar View**: Organized view of all issues by severity

### 🛡️ Security Features
- **Security Audit**: Comprehensive security vulnerability scanning
- **Secret Detection**: Find API keys, passwords, and tokens in code
- **Dependency Scanning**: Check for known vulnerabilities in dependencies
- **Pre-commit Hooks**: Block commits with security issues

### 🛠️ Code Operations
- **Explain Code**: Get AI explanations for any code selection
- **Refactor**: AI-powered code refactoring suggestions
- **Generate Tests**: Automatically generate unit tests
- **Documentation**: Generate inline documentation
- **Auto-fix**: Apply automated fixes for common issues

## Installation

### Prerequisites
1. **Node.js 18+** installed
2. **Sentinel CLI** installed globally:
   ```bash
   npm install -g sentinel-cli
   ```
3. **VSCode 1.74+**

### Setup Steps

1. **Install Dependencies**:
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Launch Extension**:
   - Press `F5` to open a new Extension Development Host window
   - Or run `code --extensionDevelopmentPath=${PWD}`

4. **Configure API Keys**:
   - Open VSCode settings (`Ctrl+,`)
   - Search for "Sentinel"
   - Add your API key for the desired provider (OpenAI, Gemini, etc.)

## Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `sentinel.enabled` | `true` | Enable/disable the extension |
| `sentinel.aiProvider` | `openai` | AI provider: openai, gemini, groq, anthropic |
| `sentinel.apiKey` | `""` | API key for the selected provider |
| `sentinel.model` | `gpt-4` | Model to use |
| `sentinel.autoAnalyze` | `false` | Auto-analyze on file save |
| `sentinel.showInlineDecorations` | `true` | Show inline issue decorations |
| `sentinel.minSeverity` | `info` | Minimum severity to show |
| `sentinel.analyzers` | `[security, quality, bugs, performance]` | Enabled analyzers |
| `sentinel.chat.maxTokens` | `4000` | Max tokens for chat responses |
| `sentinel.chat.temperature` | `0.7` | Temperature for responses |
| `sentinel.chat.includeFileContext` | `true` | Include open files in context |
| `sentinel.chat.enableToolUse` | `true` | Enable file/terminal tools |
| `sentinel.terminal.autoApprove` | `false` | Auto-approve terminal commands |
| `sentinel.terminal.timeout` | `30000` | Terminal command timeout (ms) |

### Example Configuration

```json
{
  "sentinel.enabled": true,
  "sentinel.aiProvider": "openai",
  "sentinel.apiKey": "sk-...",
  "sentinel.model": "gpt-4",
  "sentinel.autoAnalyze": true,
  "sentinel.analyzers": ["security", "quality", "bugs", "performance", "secrets"],
  "sentinel.chat.enableToolUse": true
}
```

## Usage

### Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `Sentinel: Open AI Chat` | `Ctrl+Shift+S` | Open the AI chat panel |
| `Sentinel: Analyze Current File` | `Ctrl+Shift+A` | Analyze the current file |
| `Sentinel: Analyze Folder` | - | Analyze a selected folder |
| `Sentinel: Security Audit` | - | Run security audit |
| `Sentinel: Full Project Scan` | - | Scan entire project |
| `Sentinel: Auto-fix Issues` | - | Apply automatic fixes |
| `Sentinel: Explain Selected Code` | - | Explain selected code |
| `Sentinel: Refactor Selected Code` | - | Refactor selected code |
| `Sentinel: Generate Tests` | - | Generate unit tests |
| `Sentinel: Scan for Secrets` | - | Scan for exposed secrets |
| `Sentinel: Pre-commit Check` | - | Run pre-commit validation |

### Context Menu

Right-click in the editor or explorer to access:
- **Explain Code**: Explain selected code
- **Refactor Code**: Refactor selected code
- **Analyze**: Analyze current file or folder

### Sidebar Panel

The Sentinel sidebar shows:
- **Issue Summary**: Count by severity (Critical, High, Medium, Low, Info)
- **Issue List**: All issues organized by severity
- **Quick Actions**: Open file, apply fix, ignore issue

### AI Chat Features

The AI chat panel supports:
- **Natural Language**: Ask questions about your code
- **Code Context**: Automatically includes relevant files
- **Tool Use**: AI can:
  - Read files (`read_file`)
  - Search files (`search_files`)
  - Execute terminal commands (`execute_command`)
  - Apply code changes (`apply_changes`)

Example prompts:
- "Explain this function"
- "Find all TODO comments in the project"
- "Refactor this to use async/await"
- "Generate tests for this module"
- "Check for security issues in this file"

## Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts          # Main extension entry
│   ├── services/
│   │   └── sentinelService.ts # CLI integration
│   ├── providers/
│   │   ├── chatProvider.ts   # AI chat webview
│   │   ├── sidebarProvider.ts # Sidebar webview
│   │   └── issueDiagnostics.ts # Diagnostics
│   ├── commands/
│   │   └── index.ts          # Command handlers
│   └── utils/
│       ├── fileOperations.ts # File utilities
│       └── terminalManager.ts # Terminal integration
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

### Build & Test

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package

# Run tests
npm test
```

### Debugging

1. Open the project in VSCode
2. Set breakpoints in `src/` files
3. Press `F5` to launch Extension Development Host
4. Use the extension in the new window
5. Debug output appears in the original window's Debug Console

## Troubleshooting

### Extension Not Activating
- Check that Sentinel CLI is installed: `sentinel --version`
- Verify Node.js version: `node --version` (should be 18+)
- Check VSCode version (1.74+ required)

### API Key Issues
- Verify API key is set in settings
- Check that the selected provider matches the key
- Test the key with a simple chat message

### Analysis Not Working
- Ensure workspace folder is open
- Check Sentinel CLI path in settings
- Try running `sentinel analyze` manually in terminal

### Chat Not Responding
- Check internet connection
- Verify API key is valid
- Check VSCode Output panel for errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/KunjShah95/SENTINEL-CLI/issues)
- **Documentation**: [Sentinel Docs](https://github.com/KunjShah95/SENTINEL-CLI/tree/main/docs)
- **Discord**: [Join our community](https://discord.gg/sentinel)

---

**Enjoy coding with Sentinel AI! 🛡️**
