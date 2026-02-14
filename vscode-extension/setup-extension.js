#!/usr/bin/env node

/**
 * SENTINEL VSCODE EXTENSION SETUP SCRIPT
 *
 * Automatically sets up the complete VSCode extension structure
 * Usage: node setup-extension.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🛡️  Setting up Sentinel VSCode Extension...\n');

const baseDir = path.join(__dirname, 'vscode-extension');

// Directory structure
const directories = [
  'src',
  'src/providers',
  'src/services',
  'src/managers',
  'src/watchers',
  'src/utils',
  'src/types',
  'media',
  'resources',
  'test',
  'test/suite',
  'dist'
];

// Create directories
console.log('📁 Creating directory structure...');
directories.forEach(dir => {
  const fullPath = path.join(baseDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`   ✓ Created ${dir}/`);
  }
});

console.log('\n✅ Directory structure created!\n');

// Install dependencies
console.log('📦 Installing dependencies...');
try {
  process.chdir(baseDir);
  execSync('npm install', { stdio: 'inherit' });
  console.log('\n✅ Dependencies installed!\n');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Initialize git
console.log('🔧 Initializing git...');
try {
  if (!fs.existsSync(path.join(baseDir, '.git'))) {
    execSync('git init', { stdio: 'inherit' });
    console.log('✅ Git initialized!\n');
  }
} catch (error) {
  console.log('⚠️  Git init skipped\n');
}

// Create .vscodeignore
console.log('📝 Creating .vscodeignore...');
const vscodeignore = `.vscode/**
.vscode-test/**
src/**
test/**
node_modules/**
.gitignore
.yarnrc
webpack.config.js
tsconfig.json
**/*.map
**/*.ts
!dist/**
`;

fs.writeFileSync(path.join(baseDir, '.vscodeignore'), vscodeignore);
console.log('✅ .vscodeignore created!\n');

// Create .gitignore
console.log('📝 Creating .gitignore...');
const gitignore = `node_modules/
dist/
out/
*.vsix
.vscode-test/
.env
`;

fs.writeFileSync(path.join(baseDir, '.gitignore'), gitignore);
console.log('✅ .gitignore created!\n');

// Create README
console.log('📝 Creating README.md...');
const readme = `# Sentinel Security - VSCode Extension

AI-Powered Security Analysis with Multi-Agent Intelligence

## Features

- 🤖 **AI Chat Interface** - Chat with 6 specialized AI agents
- 🔒 **Real-time Security Analysis** - Detect vulnerabilities as you code
- ✅ **Approval System** - Review and approve AI-suggested changes
- 📊 **Dashboard** - Security metrics and compliance tracking
- 🔍 **Semantic Search** - Find code using natural language
- 🎯 **Multi-Agent System** - Specialized agents for different domains
- 📈 **Threat Modeling** - Automatic STRIDE threat analysis
- 🛡️ **Compliance Checking** - OWASP, PCI-DSS, SOC2, GDPR, HIPAA

## Installation

1. Open VSCode
2. Search "Sentinel Security" in Extensions
3. Click Install
4. Configure API key in Settings

## Usage

### Quick Start

Press \`Ctrl+Shift+S\` to open AI chat

### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Open Chat | Ctrl+Shift+S | Open AI chat panel |
| Analyze File | Ctrl+Shift+A | Analyze current file |
| Fix Issue | Ctrl+Shift+F | Fix issue at cursor |

### AI Agents

- 🎯 **Adaptive** - Auto-selects best strategy
- 🔒 **Security** - Security vulnerabilities
- 🏗️ **Architecture** - Code design patterns
- 🔌 **API** - API design and endpoints
- 💾 **Database** - SQL and database queries
- 🧪 **Testing** - Test coverage and quality
- 📚 **Documentation** - Code documentation

## Configuration

\`\`\`json
{
  "sentinel.autoScan": true,
  "sentinel.severity": "medium",
  "sentinel.ragStrategy": "adaptive",
  "sentinel.llmProvider": "openai",
  "sentinel.apiKey": "your-api-key"
}
\`\`\`

## Requirements

- VSCode 1.85.0 or higher
- Sentinel CLI installed globally or in workspace

## License

MIT

## Support

- GitHub: https://github.com/yourusername/sentinel-security-cli
- Issues: https://github.com/yourusername/sentinel-security-cli/issues
`;

fs.writeFileSync(path.join(baseDir, 'README.md'), readme);
console.log('✅ README.md created!\n');

// Final message
console.log('🎉 Setup complete!\n');
console.log('Next steps:');
console.log('1. Review COMPLETE_ARCHITECTURE_GUIDE.md for full details');
console.log('2. Implement the providers and services');
console.log('3. Run `npm run compile` to build');
console.log('4. Press F5 to launch Extension Development Host');
console.log('5. Test the extension\n');
console.log('📚 See COMPLETE_ARCHITECTURE_GUIDE.md for implementation details\n');
console.log('🚀 Happy coding!\n');
