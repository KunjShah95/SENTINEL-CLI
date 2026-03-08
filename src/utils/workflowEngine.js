import { ShellExecutor } from '../utils/shellExecutor.js';
import FileOperations from '../utils/fileOperations.js';

export class WorkflowEngine {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.shell = new ShellExecutor({ cwd: this.projectPath });
    this.files = new FileOperations(this.projectPath);
  }

  async detectProjectType() {
    const pkgPath = `${this.projectPath}/package.json`;
    const hasPkg = await this.files.exists(pkgPath);
    
    if (hasPkg) {
      const pkg = await this.files.read(pkgPath);
      const json = JSON.parse(pkg.content);
      
      if (json.dependencies?.react || json.devDependencies?.react) {
        return { type: 'react', framework: 'React' };
      }
      if (json.dependencies?.vue || json.devDependencies?.vue) {
        return { type: 'vue', framework: 'Vue' };
      }
      if (json.dependencies?.next) {
        return { type: 'next', framework: 'Next.js' };
      }
      if (json.dependencies?.express) {
        return { type: 'express', framework: 'Express' };
      }
      if (json.dependencies?.fastify) {
        return { type: 'fastify', framework: 'Fastify' };
      }
      if (json.dependencies?.nestjs || json.devDependencies?.nestjs) {
        return { type: 'nestjs', framework: 'NestJS' };
      }
      if (json.dependencies?.flask || json.dependencies?.django) {
        return { type: 'python', framework: 'Python' };
      }
      if (json.dependencies?.go || json.dependencies?.gin) {
        return { type: 'go', framework: 'Go' };
      }
      return { type: 'node', framework: 'Node.js' };
    }
    
    const pyproject = await this.files.exists(`${this.projectPath}/pyproject.toml`);
    if (pyproject) return { type: 'python', framework: 'Python' };
    
    const cargo = await this.files.exists(`${this.projectPath}/Cargo.toml`);
    if (cargo) return { type: 'rust', framework: 'Rust' };
    
    const gemfile = await this.files.exists(`${this.projectPath}/Gemfile`);
    if (gemfile) return { type: 'ruby', framework: 'Ruby' };
    
    return { type: 'unknown', framework: 'Unknown' };
  }

  async getAvailableScripts() {
    const pkgPath = `${this.projectPath}/package.json`;
    const hasPkg = await this.files.exists(pkgPath);
    
    if (hasPkg) {
      const pkg = await this.files.read(pkgPath);
      const json = JSON.parse(pkg.content);
      return json.scripts || {};
    }
    return {};
  }

  async runWorkflow(workflowName, _options = {}) {
    const projectType = await this.detectProjectType();
    const scripts = await this.getAvailableScripts();
    
    const workflows = {
      dev: async () => this.runDevWorkflow(projectType, scripts),
      test: async () => this.runTestWorkflow(projectType, scripts),
      build: async () => this.runBuildWorkflow(projectType, scripts),
      lint: async () => this.runLintWorkflow(projectType, scripts),
      'test:watch': async () => this.runTestWatchWorkflow(projectType, scripts),
      ci: async () => this.runCIWorkflow(projectType, scripts),
      deploy: async () => this.runDeployWorkflow(projectType, scripts),
      analyze: async () => this.runAnalyzeWorkflow(projectType, scripts),
      fix: async () => this.runFixWorkflow(projectType, scripts),
      clean: async () => this.runCleanWorkflow(projectType, scripts),
    };

    const workflow = workflows[workflowName];
    if (!workflow) {
      return { success: false, error: `Unknown workflow: ${workflowName}` };
    }

    return await workflow();
  }

  async runDevWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts.dev) {
      steps.push({ command: 'npm run dev', label: 'Starting dev server', wait: false });
    } else if (scripts.start) {
      steps.push({ command: 'npm start', label: 'Starting application', wait: false });
    } else if (projectType.type === 'react') {
      steps.push({ command: 'echo "No dev script found"', label: 'No dev script' });
    } else {
      steps.push({ command: 'echo "No dev script found"', label: 'No dev script' });
    }

    return { success: true, workflow: 'dev', steps, projectType };
  }

  async runTestWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts.test) {
      steps.push({ command: 'npm test', label: 'Running tests' });
    } else if (projectType.type === 'python') {
      steps.push({ command: 'pytest', label: 'Running pytest' });
    } else if (projectType.type === 'go') {
      steps.push({ command: 'go test ./...', label: 'Running Go tests' });
    } else {
      steps.push({ command: 'echo "No test script found"', label: 'No test script' });
    }

    return { success: true, workflow: 'test', steps, projectType };
  }

  async runBuildWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts.build) {
      steps.push({ command: 'npm run build', label: 'Building project' });
    } else if (projectType.type === 'react') {
      steps.push({ command: 'echo "No build script found"', label: 'No build script' });
    } else if (projectType.type === 'next') {
      steps.push({ command: 'echo "No build script found"', label: 'No build script' });
    } else if (projectType.type === 'go') {
      steps.push({ command: 'go build -o app .', label: 'Building Go app' });
    } else {
      steps.push({ command: 'echo "No build script found"', label: 'No build script' });
    }

    return { success: true, workflow: 'build', steps, projectType };
  }

  async runLintWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts.lint) {
      steps.push({ command: 'npm run lint', label: 'Running linter' });
    } else if (scripts['lint:fix']) {
      steps.push({ command: 'npm run lint:fix', label: 'Running linter with fix' });
    } else {
      steps.push({ command: 'npx eslint .', label: 'Running ESLint' });
    }

    return { success: true, workflow: 'lint', steps, projectType };
  }

  async runTestWatchWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts['test:watch']) {
      steps.push({ command: 'npm run test:watch', label: 'Running tests in watch mode' });
    } else {
      steps.push({ command: 'npm test -- --watch', label: 'Running tests in watch mode' });
    }

    return { success: true, workflow: 'test:watch', steps, projectType };
  }

  async runCIWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts['lint']) {
      steps.push({ command: 'npm run lint', label: 'Lint check' });
    }
    if (scripts.test) {
      steps.push({ command: 'npm test -- --coverage', label: 'Test with coverage' });
    }
    if (scripts.build) {
      steps.push({ command: 'npm run build', label: 'Build check' });
    }

    if (steps.length === 0) {
      steps.push({ command: 'echo "No CI scripts found"', label: 'No CI scripts' });
    }

    return { success: true, workflow: 'ci', steps, projectType };
  }

  async runDeployWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts.deploy) {
      steps.push({ command: 'npm run deploy', label: 'Deploying' });
    } else if (scripts['deploy:prod']) {
      steps.push({ command: 'npm run deploy:prod', label: 'Deploying to production' });
    } else {
      steps.push({ command: 'echo "Checking for deployment options..."', label: 'No deploy script' });
      steps.push({ command: 'ls -la vercel.json next.config.js netlify.toml 2>/dev/null || echo "No deployment config found"', label: 'Check deployment config' });
    }

    return { success: true, workflow: 'deploy', steps, projectType };
  }

  async runAnalyzeWorkflow(projectType, _scripts) {
    const steps = [];
    
    steps.push({ command: 'npx sentinel analyze', label: 'Running Sentinel analysis' });

    return { success: true, workflow: 'analyze', steps, projectType };
  }

  async runFixWorkflow(projectType, scripts) {
    const steps = [];
    
    if (scripts['lint:fix']) {
      steps.push({ command: 'npm run lint:fix', label: 'Auto-fixing lint issues' });
    }
    steps.push({ command: 'npx sentinel fix', label: 'Auto-fixing Sentinel issues' });

    return { success: true, workflow: 'fix', steps, projectType };
  }

  async runCleanWorkflow(projectType, _scripts) {
    const steps = [];
    
    steps.push({ command: 'rm -rf node_modules/.cache', label: 'Cleaning cache' });
    steps.push({ command: 'rm -rf dist build .next', label: 'Cleaning build directories' });

    return { success: true, workflow: 'clean', steps, projectType };
  }

  async executeSteps(steps, onStep) {
    const results = [];
    
    for (const step of steps) {
      if (onStep) onStep(step);
      
      const result = await this.shell.exec(step.command);
      results.push({ ...step, ...result });
      
      if (!result.success && step.critical) {
        return { success: false, results, failedAt: step };
      }
    }

    return { success: true, results };
  }

  async getWorkflowStatus() {
    const projectType = await this.detectProjectType();
    const scripts = await this.getAvailableScripts();
    
    return {
      projectType,
      availableWorkflows: Object.keys(scripts).filter(s => 
        ['dev', 'start', 'build', 'test', 'lint', 'deploy'].includes(s)
      ),
      allScripts: Object.keys(scripts)
    };
  }
}

export default WorkflowEngine;
