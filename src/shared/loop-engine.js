import type { SecurityFinding } from '../shared/models/discovery.js';

export interface LoopTemplate {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'quality' | 'performance' | 'compliance';
  author: string;
  version: string;
  createdAt: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  content: string; // Template content with placeholders
}

export interface HarnessTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  complexity: 'simple' | 'moderate' | 'complex';
  components: string[]; // list of components used
  exampleUsage: string;
  public?: boolean;
}

export interface AutoPRConfig {
  autoPushEnabled: boolean;
  maxIterations: number;
  requireApproval: boolean;
  branchPrefix: string;
  targetBranch: string;
}

export class LoopEngine {
  private templates = new Map<string, LoopTemplate>();
  private configs = new Map<string, AutoPRConfig>();
  
  constructor() {
    this.initializeCoreTemplates();
    this.initializeAutoPRConfig();
  }

  private initializeCoreTemplates() {
    // Security Review Loop Template
    const securityReviewLoop: LoopTemplate = {
      id: 'security-review-loop',
      name: 'Security Review Loop',
      description: 'Get feedback, fix issues, and re-review until clean',
      category: 'security',
      author: 'Sentinel Team',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      difficulty: 'beginner',
      tags: ['security', 'review', 'audit'],
      content: `TASK: ${task}

Phase 1: Initial Security Review
- Run full security scan with SAST
- Identify {critical_high_issues} 
- Create checklist of fixes

Phase 2: Targeted Fix
- Fix highest priority issues
- Commit with descriptive message
- Push to working branch

Phase 3: Re-Review
- Run security scan again
- Check for new issues in fixes
- Continue until no critical/high

Max iterations: ${iterations}`
    };
    this.templates.set(securityReviewLoop.id, securityReviewLoop);
  }

  private initializeAutoPRConfig() {
    this.configs.set('default', {
      autoPushEnabled: true,
      maxIterations: 3,
      requireApproval: false,
      branchPrefix: 'sentinel-fix-',
      targetBranch: 'main'
    });
  }

  public getTemplates(): LoopTemplate[] {
    return Array.from(this.templates.values());
  }

  public getConfig(key: string): AutoPRConfig | undefined {
    return this.configs.get(key);
  }

  public async runLoop(loopId: string, task: string, config: any = {}): Promise<any> {
    const template = this.templates.get(loopId);
    if (!template) {
      throw new Error(`Loop template ${loopId} not found`);
    }

    // Run loop workflow
    return {
      loopId,
      task,
      status: 'running',
      phases: []
    };
  }
}

export class LoopMarketplace {
  async loadCommunityTemplates(): Promise<LoopTemplate[]> {
    // This would fetch from community package registry
    return [];
  }

  async publishTemplate(template: LoopTemplate): Promise<string> {
    // Publish to community registry
    return `https://github.com/sentinel/heatmap-templates/blob/main/${template.id}.json`;
  }
}

export class HarnessEngineering {
  private harnesses = new Map<string, HarnessTemplate>();
  
  constructor() {
    this.initializeCoreHarnesses();
  }

  private initializeCoreHarnesses() {
    // Full Review Harness
    const fullReviewHarness: HarnessTemplate = {
      id: 'full-review',
      name: 'Full Security Review Harness',
      description: 'End-to-end security review with SAST, AI analysis, and auto-fix',
      version: '2.1.0',
      createdAt: new Date().toISOString(),
      complexity: 'moderate',
      components: ['SAST', 'LSP', 'AI', 'Auth', 'Storage'],
      exampleUsage: `[SUCCESS][38%, 100%] Full review completed`
    };
    this.harnesses.set(fullReviewHarness.id, fullReviewHarness);
  }

  public getHarnesses(): HarnessTemplate[] {
    return Array.from(this.harnesses.values());
  }

  public findHarnessesByComponent(component: string): HarnessTemplate[] {
    return Array.from(this.harnesses.values())
      .filter(h => h.components.includes(component));
  }
}

export class AutoPRWorkflow {
  private config: AutoPRConfig;
  
  constructor(config?: Partial<AutoPRConfig>) {
    this.config = {
      ...this.getDefaultConfig(),
      ...config
    };
  }

  private getDefaultConfig(): AutoPRConfig {
    return {
      autoPushEnabled: true,
      maxIterations: 3,
      requireApproval: false,
      branchPrefix: 'sentinel-fix-',
      targetBranch: 'main'
    };
  }

  public async runAutoPRWorkflow(finding: SecurityFinding): Promise<any> {
    // Auto-fix workflow for a finding
    if (!this.config.autoPushEnabled) {
      return { status: 'skipped', reason: 'Auto-PR disabled' };
    }

    const branchName = `${this.config.branchPrefix}${finding.id}-${Date.now()}`;
    
    return {
      finding,
      branchName,
      status: 'fixed',
      prUrl: `https://github.com/user/repo/pull/${branchName}`
    };
  }
}
