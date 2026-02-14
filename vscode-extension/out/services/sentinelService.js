"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentinelService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode = __importStar(require("vscode"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SentinelService {
    outputChannel;
    config;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Sentinel AI');
        this.config = vscode.workspace.getConfiguration('sentinel');
    }
    getSentinelPath() {
        return this.config.get('sentinelPath', 'sentinel');
    }
    log(message) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
    async executeCommand(args, cwd) {
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
        }
        catch (error) {
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
    async analyzeFile(filePath, options) {
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
        }
        catch (error) {
            this.log(`Analysis failed: ${error.message}`);
            throw new Error(`Failed to analyze file: ${error.message}`);
        }
    }
    async analyzeFolder(folderPath, options) {
        const args = ['analyze'];
        if (options?.allAnalyzers) {
            args.push('--all-analyzers');
        }
        else {
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
        }
        catch (error) {
            this.log(`Folder analysis failed: ${error.message}`);
            throw error;
        }
    }
    async securityAudit() {
        const startTime = Date.now();
        try {
            const { stdout } = await this.executeCommand(['security-audit', '--format', 'json']);
            const issues = this.parseJsonOutput(stdout);
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            this.log(`Security audit failed: ${error.message}`);
            throw error;
        }
    }
    async fullScan() {
        const startTime = Date.now();
        try {
            const { stdout } = await this.executeCommand(['full-scan', '--format', 'json']);
            const issues = this.parseJsonOutput(stdout);
            return {
                issues,
                summary: this.calculateSummary(issues),
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            this.log(`Full scan failed: ${error.message}`);
            throw error;
        }
    }
    async scanSecrets(targetPath) {
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
        }
        catch (error) {
            this.log(`Secrets scan failed: ${error.message}`);
            throw error;
        }
    }
    async autoFix(options) {
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
        }
        catch (error) {
            this.log(`Auto-fix failed: ${error.message}`);
            throw error;
        }
    }
    async chat(prompt, context) {
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
        }
        catch (error) {
            this.log(`Chat failed: ${error.message}`);
            throw error;
        }
    }
    async explainCode(code, language) {
        const prompt = `Explain this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }
    async refactorCode(code, instructions) {
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
    async generateTests(code, language) {
        const prompt = `Generate comprehensive unit tests for this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }
    async documentCode(code, language) {
        const prompt = `Generate documentation (JSDoc/docstring/comments) for this ${language || ''} code:\n\n${code}`;
        const result = await this.chat(prompt);
        return result.response;
    }
    async getStatus() {
        try {
            const { stdout } = await this.executeCommand(['status']);
            // Parse status output
            return {
                version: '1.9.0',
                providers: ['openai', 'gemini', 'groq'],
                analyzers: this.config.get('analyzers', [])
            };
        }
        catch (error) {
            this.log(`Status check failed: ${error.message}`);
            throw error;
        }
    }
    parseJsonOutput(output) {
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
        }
        catch (e) {
            this.log(`Failed to parse JSON output: ${output.substring(0, 500)}`);
            return [];
        }
    }
    calculateSummary(issues) {
        return {
            total: issues.length,
            critical: issues.filter(i => i.severity === 'critical').length,
            high: issues.filter(i => i.severity === 'high').length,
            medium: issues.filter(i => i.severity === 'medium').length,
            low: issues.filter(i => i.severity === 'low').length,
            info: issues.filter(i => i.severity === 'info').length
        };
    }
    extractToolCalls(output) {
        // Look for tool call patterns in the output
        const toolCalls = [];
        // Pattern: <tool_call>{"id": "...", "type": "...", ...}</tool_call>
        const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
        let match;
        while ((match = toolCallRegex.exec(output)) !== null) {
            try {
                const toolData = JSON.parse(match[1]);
                toolCalls.push(toolData);
            }
            catch (e) {
                this.log(`Failed to parse tool call: ${match[1]}`);
            }
        }
        return toolCalls;
    }
    extractCodeBlock(output) {
        // Extract code from markdown code blocks
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
        const match = output.match(codeBlockRegex);
        return match ? match[1].trim() : null;
    }
    async preCommitCheck() {
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
        }
        catch (error) {
            this.log(`Pre-commit check failed: ${error.message}`);
            throw error;
        }
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.SentinelService = SentinelService;
//# sourceMappingURL=sentinelService.js.map