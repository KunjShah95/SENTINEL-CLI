# Sentinel CLI - Complete Command Guide

Sentinel is an AI-Powered Code Guardian that provides automated code review with security scanning, dependency analysis, accessibility checks, and multi-LLM integration.

## 🚀 Quick Start Commands

### Installation & Setup

```bash
# Install dependencies
npm install

# Setup configuration wizard
npm run setup
# OR
sentinel setup

# Copy environment template
cp .env.example .env
# Then edit .env with your API keys
```

### Development

```bash
# Start development mode with watch
npm run dev

# Run in development with live reload
npm run dev

# Run the main bot
npm start

# Demo mode
npm run demo
```

## 📋 NPM Scripts Reference

### Core Operations

```bash
# Start the bot
npm start

# Development mode with file watching
npm run dev

# Analyze current changes
npm run review

# Install pre-commit hooks
npm run install-hooks

# Build the project
npm run build

# Run demo
npm run demo
```

### Code Quality

```bash
# Run linting
npm run lint

# Format code with Prettier
npm run format

# Run tests
npm test

# Watch tests during development
npm run test:watch
```

### Release Management

```bash
# Build and prepare for publish
npm run prepublishOnly

# Update version and push
npm run postversion
```

## 🎯 Sentinel CLI Commands

### Analysis Commands

```bash
# Analyze current directory
sentinel analyze

# Analyze specific files
sentinel analyze src/index.js src/bot.js

# Analyze staged changes only
sentinel analyze --staged

# Analyze specific commit
sentinel analyze --commit abc123

# Analyze branch changes
sentinel analyze --branch feature-branch

# Generate JSON output
sentinel analyze --format json

# Generate HTML report
sentinel analyze --format html

# Generate Markdown report
sentinel analyze --format markdown

# Save to file
sentinel analyze --output report.json

# Disable code snippets
sentinel analyze --no-snippets
```

### Configuration & Setup

```bash
# Interactive setup wizard
sentinel setup

# Show repository statistics
sentinel stats

# Install Git pre-commit hooks
sentinel install-hooks
```

### AI Model Management

```bash
# List current AI providers
sentinel models

# Enable specific providers
sentinel models --enable openai,gemini

# Disable providers
sentinel models --disable groq,openrouter

# Set model for provider
sentinel models --model openai=gpt-4
sentinel models --model gemini=gemini-pro

# Set provider weights
sentinel models --weight openai=0.5
sentinel models --weight gemini=0.5

# Configure API key environment variables
sentinel models --env openai=OPENAI_API_KEY
sentinel models --env gemini=GEMINI_API_KEY

# Remove inline API keys
sentinel models --strip-secrets openai,gemini
```

### Interactive Features

```bash
# Launch interactive assistant
sentinel chat

# Ask specific question
sentinel chat "What are the security issues in this code?"

# Set custom persona
sentinel chat --persona "You are a senior security engineer"
```

### Banner Customization

```bash
# Custom banner message
sentinel --banner-message "MY-CODE-REVIEW"

# Custom font
sentinel --banner-font "Slant"

# Custom gradient
sentinel --banner-gradient fire

# Available gradients: aqua, fire, rainbow, aurora, mono
sentinel --banner-gradient rainbow

# Custom width
sentinel --banner-width 100

# Disable colors
sentinel --no-banner-color analyze
```

## 🐳 Docker Commands

### Building & Running

```bash
# Build the Docker image
docker build -t sentinel-cli .

# Run with docker-compose
docker-compose up

# Run specific service
docker-compose up app

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Development with Docker

```bash
# Build development image
docker build -t sentinel-dev .

# Run with volume mount for development
docker run -v $(pwd):/app -w /app sentinel-dev npm run dev

# Run analysis in container
docker run -v $(pwd):/app sentinel-dev sentinel analyze
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Copy template
cp .env.example .env

# Edit with your API keys
nano .env
```

### Key Environment Variables

```bash
# AI Provider API Keys (optional)
OPENAI_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
GROQ_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
OPENROUTER_API_KEY=your-key-here

# Optional Configurations
SENTINEL_MAX_PARALLEL=3
SENTINEL_CACHE_TTL=1440
SENTINEL_DEBUG=true
SENTINEL_FORMAT=console

# CI/CD Integration
GITHUB_TOKEN=your-token
GITLAB_TOKEN=your-token
```

### Configuration File

Sentinel creates `.codereviewrc.json` with your settings:

```json
{
  "analysis": {
    "enabledAnalyzers": ["security", "quality", "bugs", "performance"],
    "blocking": false
  },
  "output": {
    "format": "console"
  },
  "ai": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-3.5-turbo"
  }
}
```

## 🧪 Testing Commands

### Manual Testing

```bash
# Test with sample files
node integration_test_runner.js

# Quality testing
node test_quality.js

# Module testing
node test_modules.js

# Fix verification
node verify_fix.js

# Quick test file
node test_file.js
```

### Git Integration Testing

```bash
# Test on staged changes
sentinel analyze --staged

# Test on specific commit
sentinel analyze --commit HEAD~1

# Test pre-commit hooks
git add .
git commit -m "Test commit"  # Will trigger sentinel
```

## 🔄 Workflow Integration

### Pre-commit Hook Setup

```bash
# Install hooks
sentinel install-hooks

# The hook will run automatically on git commit
git add .
git commit -m "Your message"

# If issues found, fix them and try again
```

### CI/CD Integration

```bash
# GitHub Actions example
- name: Run Sentinel Analysis
  run: |
    npm install
    sentinel analyze --format json --output sentinel-report.json

# GitLab CI example
sentinel_analysis:
  script:
    - npm install
    - sentinel analyze --staged --format json
```

## 📊 Output Formats

### Console Output (Default)

```bash
sentinel analyze
# Rich colored output with emojis and formatting
```

### JSON Output

```bash
sentinel analyze --format json
# Machine-readable JSON for automation
```

### HTML Report

```bash
sentinel analyze --format html --output report.html
# Web-friendly report for sharing
```

### Markdown Report

```bash
sentinel analyze --format markdown --output report.md
# Documentation-friendly format
```

## 🛠️ Advanced Usage

### Batch Analysis

```bash
# Analyze multiple projects
for dir in project1 project2 project3; do
  cd $dir
  sentinel analyze --output ../reports/$dir.json
  cd ..
done
```

### Custom Analysis Pipeline

```bash
# Custom workflow
sentinel analyze --staged --format json > analysis.json
# Process results
node -e "console.log(JSON.stringify(require('./analysis.json'), null, 2))"
```

### Debugging

```bash
# Enable debug logging
SENTINEL_DEBUG=true sentinel analyze

# Verbose output
sentinel analyze --verbose

# Silent mode (no progress indicators)
sentinel analyze --silent
```

## 🎨 Customization Examples

### Custom Banner in CI

```bash
sentinel --banner-message "CI-REVIEW" --banner-gradient fire analyze
```

### Specific File Analysis

```bash
# Security-focused analysis
sentinel analyze src/security/ --format json

# Performance analysis
sentinel analyze --format console src/performance/
```

### Provider-Specific Analysis

```bash
# Use only OpenAI
sentinel models --disable gemini,groq,anthropic
sentinel analyze

# Use weighted analysis
sentinel models --weight openai=0.7 --weight gemini=0.3
sentinel analyze
```

## 📚 Additional Resources

- **Configuration**: Run `sentinel setup` for interactive setup
- **Documentation**: Check `README.md` for detailed information
- **Examples**: Look in `src/demo.js` for usage examples
- **Issues**: Report bugs at the project repository

## 🎯 Pro Tips

1. **Start Simple**: Begin with `sentinel analyze` to see basic functionality
2. **Use Pre-commit Hooks**: Set up `sentinel install-hooks` for automatic reviews
3. **Configure AI**: Add API keys to `.env` for enhanced AI analysis
4. **Choose Right Format**: Use `--format json` for automation, `--format console` for reviews
5. **Monitor Performance**: Use `--staged` for quick pre-commit checks
6. **Customize Output**: Use `--output` to save reports for later review

---

*For more help, run `sentinel --help` or `sentinel <command> --help`*
