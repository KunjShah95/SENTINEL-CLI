# Sentinel Security CLI - Quick Start Guide

Get started with Sentinel's enhanced features in 5 minutes!

## Installation

```bash
npm install -g @sentinel/security-cli
```

## Setup

### 1. Configure API Keys (for AI features)

```bash
# Set up your LLM provider
sentinel auth

# Or set environment variables
export GROQ_API_KEY=your_groq_key_here
export OPENAI_API_KEY=your_openai_key_here
```

### 2. Initialize Your Project

```bash
cd your-project
sentinel setup
```

## 🚀 Quick Commands

### Interactive Mode (Easiest Way to Start!)

```bash
sentinel interactive
```

In interactive mode, you can:
- Ask questions: `where do we validate passwords?`
- Analyze code: `analyze src/auth`
- Get help: `help`
- Exit: `exit`

### Essential Commands

```bash
# Understand your codebase
sentinel context

# Search for code
sentinel search "JWT validation"

# Ask questions
sentinel ask "how does authentication work?"

# Find security issues
sentinel analyze src/

# Check compliance
sentinel compliance OWASP-Top-10

# Map your attack surface
sentinel attack-surface

# Generate threat model
sentinel threats
```

## 📚 Common Workflows

### Security Audit in 3 Steps

```bash
# 1. Understand the code
sentinel context --deep

# 2. Find vulnerabilities
sentinel attack-surface
sentinel threats

# 3. Check compliance
sentinel compliance OWASP-Top-10
```

### Before Code Review

```bash
# Check what will break
sentinel impact src/important-file.js

# Trace function usage
sentinel trace myFunction

# Look for similar issues
sentinel search "authentication patterns"
```

### Daily Security Check

```bash
# Quick scan
sentinel analyze src/

# In interactive mode, address findings
sentinel interactive
```

## 🎯 Top Features to Try

### 1. **Interactive Mode** - Best for exploration
```bash
sentinel interactive
> analyze auth
> explain line 45
> suggest improvements
```

### 2. **Semantic Search** - Find anything with natural language
```bash
sentinel search "where do we handle payments"
sentinel ask "is our password hashing secure?"
```

### 3. **Attack Surface** - See your security posture
```bash
sentinel attack-surface
# Shows: API endpoints, user inputs, data flows, risk areas
```

### 4. **Threat Modeling** - Auto-identify threats
```bash
sentinel threats
# STRIDE-based threat analysis with mitigations
```

### 5. **Compliance** - Check against standards
```bash
sentinel compliance OWASP-Top-10
sentinel compliance PCI-DSS  # For payment processing
```

## 💡 Pro Tips

### 1. **Use Context First**
Always run `sentinel context` to let Sentinel understand your codebase.

### 2. **Index for Fast Search**
```bash
# One-time indexing
sentinel search "anything" --index

# Then search is instant
sentinel search "other queries"
```

### 3. **Save Important Results**
```bash
sentinel attack-surface --save report.json
sentinel threats --save threats.json
```

### 4. **Check History**
```bash
sentinel history
# See all previous commands and their results
```

### 5. **Learn from the System**
```bash
sentinel learning
# See what Sentinel has learned from your feedback
```

## 🔧 Configuration

### LLM Providers

```bash
# Use Groq (fast, free tier available)
sentinel interactive --provider groq --model mixtral

# Use OpenAI
sentinel interactive --provider openai --model gpt-4

# Use Anthropic Claude
sentinel interactive --provider anthropic --model claude-3-opus
```

### Customize Behavior

```bash
# Your preferences are saved automatically per project
# Located in: ~/.sentinel/sessions.db
```

## 🆘 Getting Help

### In CLI
```bash
sentinel --help
sentinel <command> --help
```

### In Interactive Mode
```bash
sentinel> help
```

### Documentation
```bash
# Full feature documentation
cat docs/ENHANCED_FEATURES.md

# Implementation details
cat docs/IMPLEMENTATION_SUMMARY.md
```

## 🐛 Troubleshooting

### "No API key configured"
```bash
export GROQ_API_KEY=your_key_here
# or
sentinel auth
```

### "Context analysis failed"
```bash
# Try without deep analysis first
sentinel context

# If still fails, check file permissions
ls -la
```

### "Search not working"
```bash
# Index first
sentinel search "test" --index
```

## 📖 Learn More

- Full Feature Guide: `docs/ENHANCED_FEATURES.md`
- Technical Details: `docs/IMPLEMENTATION_SUMMARY.md`
- GitHub: `https://github.com/KunjShah95/sentinel-cli`

## 🎉 What's Next?

Try these workflows:

**Day 1**: Run `sentinel context` and `sentinel interactive` to explore
**Day 2**: Try `sentinel attack-surface` and `sentinel threats`
**Day 3**: Run compliance checks: `sentinel compliance OWASP-Top-10`
**Day 4**: Use semantic search: `sentinel search` and `sentinel ask`
**Day 5**: Check what you've learned: `sentinel learning --report`

---

**Happy Securing! 🛡️**

Need help? Open an issue or join our Discord community!
