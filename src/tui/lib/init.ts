import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

type ProjectInfo = {
  language: string;
  frameworks: string[];
  packageManager: string;
  testFramework: string;
  lintTool: string;
  hasDocker: boolean;
  hasCI: boolean;
  hasDocs: boolean;
  entryPoints: string[];
  srcDirs: string[];
};

export async function analyzeProject(root: string = process.cwd()): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    language: 'unknown',
    frameworks: [],
    packageManager: 'unknown',
    testFramework: 'unknown',
    lintTool: 'unknown',
    hasDocker: false,
    hasCI: false,
    hasDocs: false,
    entryPoints: [],
    srcDirs: [],
  };

  try {
    const entries = await fs.readdir(root);

    // Package manager detection
    if (entries.includes('package.json')) {
      info.language = 'TypeScript/JavaScript';
      info.packageManager = existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' :
                            existsSync(path.join(root, 'yarn.lock')) ? 'yarn' :
                            existsSync(path.join(root, 'bun.lock')) ? 'bun' : 'npm';
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) info.frameworks.push('Next.js');
        if (deps.react) info.frameworks.push('React');
        if (deps.vue) info.frameworks.push('Vue');
        if (deps.express) info.frameworks.push('Express');
        if (deps['@nestjs/core']) info.frameworks.push('NestJS');
        if (deps.electron) info.frameworks.push('Electron');
        if (deps.jest) info.testFramework = 'Jest';
        if (deps.vitest) info.testFramework = 'Vitest';
        if (deps.mocha) info.testFramework = 'Mocha';
        if (deps.cypress) info.testFramework = 'Cypress';
        if (deps.playwright) info.testFramework = 'Playwright';
        if (deps.eslint) info.lintTool = 'ESLint';
        if (deps.prettier) info.lintTool = info.lintTool !== 'unknown' ? `${info.lintTool} + Prettier` : 'Prettier';
      } catch { /* ignore */ }
    }

    if (entries.includes('Cargo.toml')) {
      info.language = 'Rust';
      info.packageManager = 'cargo';
    }
    if (entries.includes('go.mod')) {
      info.language = 'Go';
      info.packageManager = 'go mod';
    }
    if (entries.includes('Gemfile')) {
      info.language = 'Ruby';
      info.packageManager = 'bundler';
    }
    if (entries.includes('requirements.txt') || entries.includes('pyproject.toml')) {
      info.language = 'Python';
      info.packageManager = entries.includes('pyproject.toml') ? 'pip/poetry' : 'pip';
    }
    if (entries.includes('pom.xml') || entries.includes('build.gradle')) {
      info.language = 'Java';
      info.packageManager = entries.includes('pom.xml') ? 'maven' : 'gradle';
    }

    // Detect common src directories
    for (const dir of ['src', 'lib', 'app', 'packages', 'source']) {
      if (entries.includes(dir)) {
        info.srcDirs.push(dir);
      }
    }

    // Entry points
    for (const entry of ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'cli.ts', 'cli.js', 'bin/sentinel.js', 'src/index.ts', 'src/main.ts']) {
      if (entries.includes(entry) || existsSync(path.join(root, entry))) {
        info.entryPoints.push(entry);
      }
    }
    if (info.entryPoints.length === 0 && info.srcDirs.length > 0) {
      // Look for entry in src dirs
      for (const dir of info.srcDirs) {
        for (const entry of ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js']) {
          if (existsSync(path.join(root, dir, entry))) {
            info.entryPoints.push(`${dir}/${entry}`);
          }
        }
      }
    }

    info.hasDocker = entries.some(e => e === 'Dockerfile' || e.startsWith('Dockerfile.'));
    info.hasCI = entries.some(e => e === '.github' || e === '.gitlab-ci.yml' || e === '.circleci');
    info.hasDocs = entries.some(e => e === 'docs' || e === 'README.md' || e === 'CONTRIBUTING.md');

  } catch { /* fall through with defaults */ }

  return info;
}

export function generateAgentsMd(project: string, info: ProjectInfo): string {
  const lines: string[] = [];
  lines.push(`# ${path.basename(project)}`);
  lines.push('');
  lines.push('## Project Overview');
  lines.push(`- **Language:** ${info.language}`);
  lines.push(`- **Frameworks:** ${info.frameworks.join(', ') || 'none detected'}`);
  lines.push(`- **Package Manager:** ${info.packageManager}`);
  lines.push(`- **Test Framework:** ${info.testFramework}`);
  lines.push(`- **Lint Tool:** ${info.lintTool}`);
  lines.push(`- **Entry Points:** ${info.entryPoints.join(', ') || 'none detected'}`);
  if (info.hasDocker) lines.push('- **Docker:** yes');
  if (info.hasCI) lines.push('- **CI/CD:** yes');
  if (info.hasDocs) lines.push('- **Documentation:** yes');
  lines.push('');

  lines.push('## Code Conventions');
  lines.push('- Prefer TypeScript over JavaScript');
  lines.push('- Use async/await over promises');
  lines.push('- Follow existing code style in the file being edited');
  lines.push('');

  lines.push('## Architecture');
  lines.push(`- Source in: ${info.srcDirs.join(', ') || 'project root'}`);
  lines.push('- Use relative imports within the project');
  lines.push('');

  lines.push('## Testing');
  lines.push(`- Test framework: ${info.testFramework}`);
  lines.push('- Run tests before marking a task complete');
  lines.push('');

  lines.push('## Build & Run');
  lines.push(`- Package manager: ${info.packageManager}`);
  if (info.language === 'TypeScript/JavaScript') {
    lines.push('- `npm run dev` — start development server');
    lines.push('- `npm run build` — build for production');
    lines.push('- `npm test` — run tests');
  }
  lines.push('');
  lines.push('## Notes for AI Agents');
  lines.push('- When making changes, prefer small, focused edits');
  lines.push('- Always verify changes compile/test before declaring completion');
  lines.push('- Follow the existing patterns in the codebase');
  lines.push('- Use the project\'s established naming conventions');

  return lines.join('\n');
}
