/**
 * ENHANCED CHAT PROVIDER
 *
 * Cline/Claude Code-style chat interface with:
 * - Multi-agent support (6 specialized agents)
 * - Streaming responses
 * - File context awareness
 * - Task tracking
 * - Approval system for changes
 * - Rich formatting with code highlighting
 * - Image/diagram support
 * - Memory/history
 */
import * as vscode from 'vscode';
import { SentinelService } from '../services/sentinelService';
import { FileOperations } from '../utils/fileOperations';
export declare class EnhancedChatProvider implements vscode.WebviewViewProvider {
    private _view?;
    private _messages;
    private _currentAgent;
    private _context;
    private _sentinelService;
    private _fileOps;
    private _approvalManager;
    constructor(context: vscode.ExtensionContext, sentinelService: SentinelService, fileOps: FileOperations);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private handleUserMessage;
    private buildContext;
    private getRelevantFiles;
    private requestApproval;
    private approveAction;
    private rejectAction;
    private executeAction;
    private regenerateResponse;
    private getAvailableAgents;
    private clearHistory;
    private exportChat;
    private saveHistory;
    private postMessage;
    private generateId;
    reveal(): void;
    sendMessage(message: string): Promise<void>;
    selectAgent(agent: string): void;
    private _getHtmlForWebview;
}
//# sourceMappingURL=enhancedChatProvider.d.ts.map