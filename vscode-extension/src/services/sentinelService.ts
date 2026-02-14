import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';

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
