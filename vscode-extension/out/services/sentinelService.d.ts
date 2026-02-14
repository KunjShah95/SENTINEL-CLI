export interface AnalysisIssue {
    id?: string;
    file: string;
    line: number;
    column?: number;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    message: string;
    description?: string;
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
export declare class SentinelService {
    private outputChannel;
    private config;
    constructor();
    private getSentinelPath;
    private log;
    executeCommand(args: string[], cwd?: string): Promise<{
        stdout: string;
        stderr: string;
    }>;
    analyzeFile(filePath: string, options?: {
        analyzers?: string[];
        format?: 'json' | 'console';
    }): Promise<AnalysisResult>;
    analyzeFolder(folderPath: string, options?: {
        analyzers?: string[];
        allAnalyzers?: boolean;
    }): Promise<AnalysisResult>;
    securityAudit(): Promise<AnalysisResult>;
    fullScan(): Promise<AnalysisResult>;
    scanSecrets(targetPath?: string): Promise<AnalysisResult>;
    autoFix(options?: {
        type?: string;
        dryRun?: boolean;
    }): Promise<{
        applied: number;
        skipped: number;
        details: string[];
    }>;
    chat(prompt: string, context?: {
        files?: string[];
        history?: ChatMessage[];
    }): Promise<{
        response: string;
        toolCalls?: ToolCall[];
    }>;
    explainCode(code: string, language?: string): Promise<string>;
    refactorCode(code: string, instructions?: string): Promise<{
        refactored: string;
        explanation: string;
    }>;
    generateTests(code: string, language?: string): Promise<string>;
    documentCode(code: string, language?: string): Promise<string>;
    getStatus(): Promise<{
        version: string;
        providers: string[];
        analyzers: string[];
    }>;
    private parseJsonOutput;
    private calculateSummary;
    private extractToolCalls;
    private extractCodeBlock;
    preCommitCheck(): Promise<PreCommitResult>;
    dispose(): void;
}
//# sourceMappingURL=sentinelService.d.ts.map