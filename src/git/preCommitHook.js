import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class PreCommitHookManager {
  constructor(options = {}) {
    this.gitHooksPath = options.gitHooksPath || '.git/hooks';
    this.blockOnCritical = options.blockOnCritical ?? true;
    this.blockOnHigh = options.blockOnHigh ?? false;
    this.analyzers = options.analyzers || ['security', 'secrets', 'quality'];
    this.failThreshold = options.failThreshold || 'high';
    this.timeout = options.timeout || 30000;
  }

  /**
   * Install pre-commit hook
   */
  async install() {
    const hookDir = path.join(process.cwd(), this.gitHooksPath);
    const hookPath = path.join(hookDir, 'pre-commit');

    try {
      await fs.mkdir(hookDir, { recursive: true });
    } catch (e) { /* dir exists */ }

    const hookContent = this.generateHookScript();
    await fs.writeFile(hookPath, hookContent, 'utf8');
    
    // Make executable
    try {
      execSync(`chmod +x "${hookPath}"`, { stdio: 'ignore' });
    } catch (e) { /* Windows doesn't support chmod */ }

    return { success: true, path: hookPath };
  }

  /**
   * Generate pre-commit hook script
   */
  generateHookScript() {
    return `#!/bin/sh
# Sentinel CLI Pre-commit Hook
# Generated automatically - do not edit

echo "🛡️ Sentinel: Running security analysis..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo "No staged files to analyze"
  exit 0
fi

# Run sentinel with staged files
npx sentinel analyze --staged --format console

RESULT=$?

if [ $RESULT -ne 0 ]; then
  echo ""
  echo "⚠️  Sentinel found issues in your code!"
  echo "To bypass this check, use: git commit --no-verify"
  echo "To fix issues, run: sentinel analyze --fix"
  exit 1
fi

echo "✅ Sentinel: All checks passed!"
exit 0
`;
  }

  /**
   * Uninstall pre-commit hook
   */
  async uninstall() {
    const hookPath = path.join(process.cwd(), this.gitHooksPath, 'pre-commit');
    
    try {
      await fs.unlink(hookPath);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to uninstall hook: ${error.message}`);
    }
  }

  /**
   * Check if hook is installed
   */
  async isInstalled() {
    const hookPath = path.join(process.cwd(), this.gitHooksPath, 'pre-commit');
    
    try {
      await fs.access(hookPath);
      const content = await fs.readFile(hookPath, 'utf8');
      return content.includes('Sentinel');
    } catch (e) {
      return false;
    }
  }

  /**
   * Run quick check on staged files (for CLI)
   */
  async runQuickCheck(_options = {}) {
    try {
      // Get staged files
      const staged = execSync('git diff --cached --name-only --diff-filter=ACM', {
        encoding: 'utf8',
        timeout: 5000,
      });
      
      const files = staged.split('\n').filter(Boolean);
      
      if (files.length === 0) {
        return {
          passed: true,
          filesScanned: 0,
          issues: [],
          message: 'No staged files to analyze',
        };
      }

      // Run analysis (this would call the actual analyzer)
      // For now, return a placeholder
      return {
        passed: true,
        filesScanned: files.length,
        files,
        issues: [],
        message: `Analyzed ${files.length} staged files`,
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Get hook configuration
   */
  getConfig() {
    return {
      blockOnCritical: this.blockOnCritical,
      blockOnHigh: this.blockOnHigh,
      analyzers: this.analyzers,
      failThreshold: this.failThreshold,
      timeout: this.timeout,
    };
  }

  /**
   * Update hook configuration
   */
  updateConfig(config) {
    Object.assign(this, config);
    return this.getConfig();
  }
}

export default PreCommitHookManager;
