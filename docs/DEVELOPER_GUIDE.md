# Sentinel CLI — Developer Integration & SDK Guide

Welcome to the Sentinel CLI Developer Guide. This document provides a complete guide to setting up Sentinel CLI, using the command-line interface (CLI) and Terminal UI (TUI), and integrating Sentinel's programmatic Agent SDK into your applications.

---

## Table of Contents
1. [Overview](#1-overview)
2. [Setup & Configuration](#2-setup--configuration)
3. [CLI & TUI Usage](#3-cli--tui-usage)
4. [Programmatic Agent SDK](#4-programmatic-agent-sdk)
5. [Advanced Agent Capabilities (Phase 2)](#5-advanced-agent-capabilities-phase-2)
6. [Testing & Contribution](#6-testing--contribution)

---

## 1. Overview
Sentinel is a local-first, privacy-focused code security and assistant platform. It combines static analysis (21 built-in analyzers) with an autonomous AI coding agent capable of:
- Exploring and reading files
- Writing and modifying code safely using **Checkpoints**
- Running sandboxed CLI commands (`bash`)
- Auditing staged/unstaged code diffs (`REVIEW` mode)
- Executing long-running tasks in the background

---

## 2. Setup & Configuration

### Prerequisites
- **Node.js**: `v20.0.0` or higher (recommended: Node 22+)
- **Bun**: `v1.x` (required for running the terminal UI due to FFI support)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd sentinel-cli
npm install
```
*Note: Installing dependencies automatically compiles the CLI binaries into the `dist/` directory.*

### Global CLI Link
To make the `sentinel` command available globally in your terminal:
```bash
npm install -g .
```

### Environment Variables
Configure your AI providers by creating a `.env` file in the root directory:
```ini
# AI Provider Keys (at least one is required for agent execution)
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key

# Optional Configurations
SEARCH_WEB_ENDPOINT=https://html.duckduckgo.com/html/
SENTINEL_DB_BACKEND=json # 'json' or 'sqlite'
```

---

## 3. CLI & TUI Usage

### Launching the TUI (Terminal UI)
Run the following command to open the interactive React-based terminal dashboard:
```bash
sentinel
# or
npm start
```
*Tip: Ensure Bun is installed to support OpenTUI's terminal rendering.*

### Common TUI Commands
Inside the TUI, type `/` to access commands:
- `/mode`: Toggle between `BUILD`, `PLAN`, and `REVIEW` modes.
- `/model <name>`: Switch the underlying chat model.
- `/clear`: Clear the current chat history.
- `/review`: Pipes git diff changes into REVIEW mode for a quick security/bug audit.
- `/undo`: Restore files from the most recent checkpoint.
- `/background <prompt>`: Spin up an asynchronous background agent.
- `/agents`: Check active and completed background agent tasks.

### Command Line Interface (CLI)
You can invoke Sentinel directly from your shell without launching the TUI:
```bash
sentinel login                      # Connect and generate local authentication token
sentinel whoami                     # Show user state, current mode, and credits
sentinel analyze src/               # Run static analyzers on a folder
sentinel security-audit             # Execute a vulnerability check
sentinel status                     # View system daemon status
```

---

## 4. Programmatic Agent SDK
Developers can leverage Sentinel's LLM orchestration and sandboxed tools programmatically by importing the `Agent` SDK.

### Basic Usage
```javascript
import { Agent } from 'sentinel-cli/sdk';

const agent = new Agent({
  mode: 'BUILD', // Options: 'BUILD' (read-write), 'PLAN' (read-only), 'REVIEW' (audit)
  model: 'claude-sonnet-4-6', // LLM model identifier
  apiKey: process.env.ANTHROPIC_API_KEY
});
```

### Streaming Responses
Use the `stream()` async generator to receive live tokens of text and reasoning from the agent:
```javascript
async function run() {
  const prompt = "Explain how the routing works in src/server/api/routes/sessions.js";
  
  for await (const chunk of agent.stream(prompt)) {
    process.stdout.write(chunk);
  }
}
run();
```

### Awaiting Full Response
Send a prompt and receive the completed response text:
```javascript
async function run() {
  const result = await agent.send("Summarize the files located in src/shared/schemas/");
  console.log("Agent Response:", result);
}
run();
```

---

## 5. Advanced Agent Capabilities (Phase 2)

### 1. File Checkpoints & Safety Rollbacks
Sentinel implements automatic system check-pointing before making any destructive edits (via `writeFile` or `editFile`). 
- Checkpoints are saved in `.sentinel/checkpoints/` containing file diffs and metadata.
- When an operation is rolled back (via the `/undo` TUI command or the `undoLastChange` tool), modified files are restored, and newly created files are safely deleted.
- Older checkpoints are pruned automatically, keeping only the **10 most recent** snapshots.

### 2. Background Agents
For long-running tasks, background agents run completely asynchronously in the background.
- Triggered by `/background <prompt>`.
- Executes inside a separated process wrapper.
- Logs and outputs are continuously written to `.sentinel/agents/<agent-id>.log`.

### 3. Code Diff Review
By running `/review` (or using the `REVIEW` mode), Sentinel hooks into `git diff` and applies structural reviews, flagging:
- SQL injection, XSS, Path Traversal
- Leakage of API keys or credentials
- Concurrency race conditions
- Missing input validation and uncaught Promise exceptions

---

## 6. Testing & Contribution

### Running Tests
To run unit and integration tests:
```bash
npm run test:unit    # Run node-native test runner (fastest)
npm run test:jest    # Run Jest suite
npm test             # Run all tests (Jest + native test runner)
```

### Linting & Formatting
Keep the codebase clean:
```bash
npm run format       # Prettify the source files
```
