import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export interface AnalysisIssue {
    id: string | number | { value: string | number; target: vscode.Uri; } | undefined;
    file: string;
    line: number;
    column?: number;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    message: string;
    suggestion?: string;
    fix?: string;
    analyzer: string;
    code?: string;
}

export interface AnalysisResult {
    issues: AnalysisIssue[];
    summary: {
        total: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    duration: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    type: 'file_read' | 'file_write' | 'terminal' | 'search' | 'analyze';
    function: {
        name: string;
        arguments: Record<string, any>;
    };
}

export interface ToolAction {
    type: 'write' | 'execute' | 'delete';
    file?: string;
    content?: string;
}

export interface PreCommitResult {
    blocked: boolean;
    issues: AnalysisIssue[];
    summary: {
        total: number;
        critical: number;
        high: number;
    };
    duration: number;
}

export class SentinelService {
    private outputChannel: vscode.OutputChannel;
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Sentinel AI');
        this.config = vscode.workspace.getConfiguration('sentinel');
    }

    private getSentinelPath(): string {
        return this.config.get('sentinelPath', 'sentinel');
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    async executeCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
        const sentinelPath = this.getSentinelPath();
        const cmd = `${sentinelPath} ${args.join(' ')}`;
        
        this.log(`Executing: ${cmd}`);
        
        try {
            const result = await execAsync(cmd, {
                cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                maxBuffer: 50 * 1024 * 1024, // 50MB
                timeout: 120000 // 2 minutes
            });
            return result;
        } catch (error: any) {
            // If command not found, try with npx
            if (error.code === 127 || error.message.includes('not found')) {
                const npxCmd = `npx sentinel ${args.join(' ')}`;
                this.log(`Retrying with npx: ${npxCmd}`);
                return await execAsync(npxCmd, {
                    cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                    maxBuffer: 50 * 1024 * 1024,
                    timeout: 120000
                });
            }
            throw error;
        }
    }

    async analyzeFile(filePath: string, options?: {
        analyzers?: string[];
        format?: 'json' | 'console';
    }): Promise<AnalysisResult> {
        const analyzers = options?.analyzers || this.config.get('analyzers', ['security', 'quality', 'bugs']);
        const format = options?.format || 'json';

        const args = [
            'analyze',
            filePath,
            '--analyzers', analyzers.join(','),
            '--format', format
        ];

        const startTime = Date.now();
        
        try {
            const { stdout } = await this.executeCommand(args);
            
            if (format === 'json') {
                const issues = this.parseJsonOutput(stdout);
                return {
                    issues,
                    summary: this.calculateSummary(issues),
                    duration: Date.now() - startTime
                };
            }

            return {
                issues: [],
                summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Analysis failed: ${error.message}`);
            throw new Error(`Failed to analyze file: ${error.message}`);
        }
    }

    async analyzeFolder(folderPath: string, options?: {
        analyzers?: string[];
        allAnalyzers?: boolean;
    }): Promise<AnalysisResult> {
        const args = ['analyze'];

        if (options?.allAnalyzers) {
            args.push('--all-analyzers');
        } else {
            const analyzers = options?.analyzers || this.config.get('analyzers', ['security', 'quality', 'bugs']);
            args.push('--analyzers', analyzers.join(','));
        }

        args.push('--format', 'json');

        const startTime = Date.now();

        try {
            const { stdout } = await this.executeCommand(args);
            const issues = this.parseJsonOutput(stdout);
            
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Folder analysis failed: ${error.message}`);
            throw error;
        }
    }

    async securityAudit(): Promise<AnalysisResult> {
        const startTime = Date.now();
        
        try {
            const { stdout } = await this.executeCommand(['security-audit', '--format', 'json']);
            const issues = this.parseJsonOutput(stdout);
            
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Security audit failed: ${error.message}`);
            throw error;
        }
    }

    async fullScan(): Promise<AnalysisResult> {
        const startTime = Date.now();
        
        try {
            const { stdout } = await this.executeCommand(['full-scan', '--format', 'json']);
            const issues = this.parseJsonOutput(stdout);
            
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Full scan failed: ${error.message}`);
            throw error;
        }
    }

    async scanSecrets(targetPath?: string): Promise<AnalysisResult> {
        const startTime = Date.now();
        const args = ['scan-secrets'];
        
        if (targetPath) {
            args.push(targetPath);
        }
        args.push('--format', 'json');

        try {
            const { stdout } = await this.executeCommand(args);
            const issues = this.parseJsonOutput(stdout);
            
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Secrets scan failed: ${error.message}`);
            throw error;
        }
    }

    async autoFix(options?: {
        type?: string;
        dryRun?: boolean;
    }): Promise<{ applied: number; skipped: number; details: string[] }> {
        const args = ['fix'];
        
        if (options?.type) {
            args.push('--type', options.type);
        }
        if (options?.dryRun) {
            args.push('--dry-run');
        }

        try {
            const { stdout } = await this.executeCommand(args);
            
            // Parse fix results from output
            const applied = (stdout.match(/Applied/g) || []).length;
            const skipped = (stdout.match(/Skipped/g) || []).length;
            
            return {
                applied,
                skipped,
                details: stdout.split('\n').filter(line => line.trim())
            };
        } catch (error: any) {
            this.log(`Auto-fix failed: ${error.message}`);
            throw error;
        }
    }

    async chat(prompt: string, context?: {
        files?: string[];
        history?: ChatMessage[];
    }): Promise<{
        response: string;
        toolCalls?: ToolCall[];
    }> {
        const args = ['chat', '--prompt', prompt];
        
        // Add context files if provided
        if (context?.files && context.files.length > 0) {
            for (const file of context.files) {
                args.push('--file', file);
            }
        }

        try {
            const { stdout } = await this.executeCommand(args);
            
            // Parse response - check for tool calls
            const toolCalls = this.extractToolCalls(stdout);
            
            return {
                response: stdout,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined
            };
        } catch (error: any) {
            this.log(`Chat failed: ${error.message}`);
            throw error;
        }
    }

    async chatStream(options: {
        message: string;
        agent?: string;
        context?: string[];
        history?: ChatMessage[];
        onToken?: (token: string) => void;
        onThinking?: (thinking: string) => void;
        onAction?: (action: ToolAction) => Promise<boolean> | boolean;
        onComplete?: () => void;
        onError?: (error: string) => void;
    }): Promise<void> {
        try {
            options.onThinking?.(`Routing request to ${options.agent || 'adaptive'} agent...`);

            const result = await this.chat(options.message, {
                files: options.context,
                history: options.history
            });

            const responseText = this.stripToolCallMarkup(result.response);
            const tokens = responseText.match(/\S+\s*/g) || [];
            for (const token of tokens) {
                options.onToken?.(token);
            }

            const actions = this.convertToolCallsToActions(result.toolCalls || []);
            for (const action of actions) {
                if (options.onAction) {
                    await options.onAction(action);
                }
            }

            options.onComplete?.();
        } catch (error: any) {
            options.onError?.(error.message || 'Unknown chat error');
            throw error;
        }
    }

    async semanticSearch(
        query: string,
        options?: { topK?: number }
    ): Promise<Array<{ file: string; line: number; snippet: string; score: number }>> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return [];
        }

        const topK = options?.topK || 5;
        const files = await this.collectSearchFiles(workspaceRoot);

        const rawTerms = query
            .toLowerCase()
            .split(/\s+/)
            .map(term => term.trim())
            .filter(Boolean);
        const terms = rawTerms.filter(term => term.length > 2);
        const searchTerms = terms.length > 0 ? terms : rawTerms.slice(0, 3);

        const results: Array<{ file: string; line: number; snippet: string; score: number }> = [];

        for (const filePath of files) {
            let content = '';
            try {
                content = await fs.readFile(filePath, 'utf8');
            } catch {
                continue;
            }

            const lowercase = content.toLowerCase();
            let score = 0;
            for (const term of searchTerms) {
                if (!term) continue;
                score += this.countOccurrences(lowercase, term);
            }

            if (score === 0) {
                continue;
            }

            const lines = content.split(/\r?\n/);
            let matchLine = 1;
            let snippet = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (searchTerms.some(term => term && line.toLowerCase().includes(term))) {
                    matchLine = i + 1;
                    snippet = line.trim();
                    break;
                }
            }

            results.push({
                file: filePath,
                line: matchLine,
                snippet: snippet || path.basename(filePath),
                score
            });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    async explainCode(code: string, language?: string): Promise<string> {
        const prompt = `Explain this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }

    async refactorCode(code: string, instructions?: string): Promise<{
        refactored: string;
        explanation: string;
    }> {
        const prompt = instructions 
            ? `Refactor this code according to: ${instructions}\n\n${code}`
            : `Refactor this code to improve quality, performance, and readability:\n\n${code}`;
        
        const result = await this.chat(prompt);
        
        // Try to extract code blocks from response
        const codeBlock = this.extractCodeBlock(result.response);
        
        return {
            refactored: codeBlock || result.response,
            explanation: result.response
        };
    }

    async generateTests(code: string, language?: string): Promise<string> {
        const prompt = `Generate comprehensive unit tests for this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }

    async documentCode(code: string, language?: string): Promise<string> {
        const prompt = `Generate documentation (JSDoc/docstring/comments) for this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }

    async getStatus(): Promise<{
        version: string;
        providers: string[];
        analyzers: string[];
    }> {
        try {
            const { stdout } = await this.executeCommand(['status']);
            
            // Parse status output
            return {
                version: '1.9.0',
                providers: ['openai', 'gemini', 'groq'],
                analyzers: this.config.get('analyzers', [])
            };
        } catch (error: any) {
            this.log(`Status check failed: ${error.message}`);
            throw error;
        }
    }

    private parseJsonOutput(output: string): AnalysisIssue[] {
        try {
            // Try to find JSON array in output
            const jsonMatch = output.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // Try to parse entire output as JSON
            const parsed = JSON.parse(output);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            if (parsed.issues && Array.isArray(parsed.issues)) {
                return parsed.issues;
            }
            
            return [];
        } catch (e) {
            this.log(`Failed to parse JSON output: ${output.substring(0, 500)}`);
            return [];
        }
    }

    private calculateSummary(issues: AnalysisIssue[]): AnalysisResult['summary'] {
        return {
            total: issues.length,
            critical: issues.filter(i => i.severity === 'critical').length,
            high: issues.filter(i => i.severity === 'high').length,
            medium: issues.filter(i => i.severity === 'medium').length,
            low: issues.filter(i => i.severity === 'low').length,
            info: issues.filter(i => i.severity === 'info').length
        };
    }

    private extractToolCalls(output: string): ToolCall[] {
        // Look for tool call patterns in the output
        const toolCalls: ToolCall[] = [];
        
        // Pattern: <tool_call>{"id": "...", "type": "...", ...}</tool_call>
        const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
        let match;
        
        while ((match = toolCallRegex.exec(output)) !== null) {
            try {
                const toolData = JSON.parse(match[1]);
                toolCalls.push(toolData);
            } catch (e) {
                this.log(`Failed to parse tool call: ${match[1]}`);
            }
        }
        
        return toolCalls;
    }

    private stripToolCallMarkup(output: string): string {
        return output.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
    }

    private convertToolCallsToActions(toolCalls: ToolCall[]): ToolAction[] {
        const actions: ToolAction[] = [];

        for (const toolCall of toolCalls) {
            const functionName = toolCall.function?.name || '';
            const args = toolCall.function?.arguments || {};

            if (toolCall.type === 'file_write' || functionName.includes('write')) {
                actions.push({
                    type: 'write',
                    file: args.file || args.path,
                    content: args.content || args.text || ''
                });
                continue;
            }

            if (toolCall.type === 'terminal' || functionName.includes('command') || functionName.includes('exec')) {
                actions.push({
                    type: 'execute',
                    content: args.command || args.cmd || ''
                });
                continue;
            }

            if (functionName.includes('delete')) {
                actions.push({
                    type: 'delete',
                    file: args.file || args.path
                });
            }
        }

        return actions;
    }

    private async collectSearchFiles(rootPath: string): Promise<string[]> {
        const includeExtensions = new Set([
            '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.rs', '.kt', '.swift',
            '.json', '.yaml', '.yml', '.md'
        ]);
        const excludedDirs = new Set([
            'node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'out', 'coverage'
        ]);
        const files: string[] = [];

        const walk = async (dir: string) => {
            let entries: Array<import('fs').Dirent> = [];
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!excludedDirs.has(entry.name)) {
                        await walk(path.join(dir, entry.name));
                    }
                    continue;
                }

                if (!entry.isFile()) {
                    continue;
                }

                const fullPath = path.join(dir, entry.name);
                if (includeExtensions.has(path.extname(fullPath).toLowerCase())) {
                    files.push(fullPath);
                }
            }
        };

        await walk(rootPath);
        return files.slice(0, 500);
    }

    private countOccurrences(content: string, term: string): number {
        if (!term) return 0;
        let count = 0;
        let position = 0;

        while (position < content.length) {
            const index = content.indexOf(term, position);
            if (index === -1) break;
            count++;
            position = index + term.length;
        }

        return count;
    }

    private extractCodeBlock(output: string): string | null {
        // Extract code from markdown code blocks
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
        const match = output.match(codeBlockRegex);
        return match ? match[1].trim() : null;
    }

    async preCommitCheck(): Promise<PreCommitResult> {
        const startTime = Date.now();
        
        try {
            const { stdout } = await this.executeCommand(['pre-commit', '--format', 'json']);
            const issues = this.parseJsonOutput(stdout);
            
            const blocked = issues.some(i => i.severity === 'critical' || i.severity === 'high');
            
            return {
                blocked,
                issues,
                summary: {
                    total: issues.length,
                    critical: issues.filter(i => i.severity === 'critical').length,
                    high: issues.filter(i => i.severity === 'high').length
                },
                duration: Date.now() - startTime
            };
        } catch (error: any) {
            this.log(`Pre-commit check failed: ${error.message}`);
            throw error;
        }
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
