import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

export class ProjectScanner {
  /**
   * Scans a target directory and returns metadata about the project stack.
   * @param {string} dirPath - Absolute path to the directory
   * @returns {Promise<object>} Project metadata: language, build/run commands, test/lint tooling.
   */
  static async scan(dirPath) {
    const root = path.resolve(dirPath);
    const files = await fs.readdir(root);

    const metadata = {
      path: root,
      projectType: 'generic',
      language: 'javascript',
      packageManager: null,
      testRunner: null,
      linter: null,
      hasGit: false,
    };

    if (files.includes('.git')) {
      metadata.hasGit = true;
    }

    // Node.js detection
    if (files.includes('package.json')) {
      metadata.projectType = 'node';
      metadata.language = 'javascript';
      metadata.packageManager = 'npm';
      metadata.testRunner = 'npm test';
      metadata.linter = 'npm run lint';

      try {
        const pkgContent = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent);
        
        // Refine linter/test command from package.json scripts
        if (pkg.scripts) {
          if (pkg.scripts.test) metadata.testRunner = 'npm test';
          if (pkg.scripts.lint) metadata.linter = 'npm run lint';
        }

        // Detect lockfiles to pin package manager
        if (files.includes('yarn.lock')) metadata.packageManager = 'yarn';
        else if (files.includes('pnpm-lock.yaml')) metadata.packageManager = 'pnpm';
        else if (files.includes('bun.lockb') || files.includes('bun.lock')) metadata.packageManager = 'bun';

        // Detect TypeScript config
        if (files.includes('tsconfig.json') || pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
          metadata.language = 'typescript';
        }
      } catch {
        // Fallback to defaults
      }
      return metadata;
    }

    // Python detection
    if (files.includes('requirements.txt') || files.includes('pyproject.toml') || files.includes('Pipfile') || files.some(f => f.endsWith('.py'))) {
      metadata.projectType = 'python';
      metadata.language = 'python';
      metadata.packageManager = 'pip';
      metadata.testRunner = 'pytest';
      metadata.linter = 'flake8';

      if (files.includes('Pipfile')) metadata.packageManager = 'pipenv';
      else if (files.includes('poetry.lock')) metadata.packageManager = 'poetry';
      
      return metadata;
    }

    // Go detection
    if (files.includes('go.mod')) {
      metadata.projectType = 'go';
      metadata.language = 'go';
      metadata.packageManager = 'go';
      metadata.testRunner = 'go test ./...';
      metadata.linter = 'golangci-lint run';
      return metadata;
    }

    // Rust detection
    if (files.includes('Cargo.toml')) {
      metadata.projectType = 'rust';
      metadata.language = 'rust';
      metadata.packageManager = 'cargo';
      metadata.testRunner = 'cargo test';
      metadata.linter = 'cargo clippy';
      return metadata;
    }

    return metadata;
  }
}

export default ProjectScanner;
