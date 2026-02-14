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
import * as path from 'path';
import { SentinelService } from '../services/sentinelService';
import { FileOperations } from '../utils/fileOperations';
import { ApprovalManager } from '../managers/approvalManager';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    agent?: string;
    timestamp: number;
    thinking?: string;
    actions?: Action[];
    status?: 'pending' | 'streaming' | 'complete' | 'error';
}

interface Action {
    type: 'write' | 'execute' | 'delete';
    file?: string;
    content?: string;
    approved?: boolean;
}

export class EnhancedChatProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: Message[] = [];
    private _currentAgent: string = 'adaptive';
    private _context: vscode.ExtensionContext;
    private _sentinelService: SentinelService;
    private _fileOps: FileOperations;
    private _approvalManager: ApprovalManager;

    constructor(
        context: vscode.ExtensionContext,
        sentinelService: SentinelService,
        fileOps: FileOperations
    ) {
        this._context = context;
        this._sentinelService = sentinelService;
        this._fileOps = fileOps;
        this._approvalManager = new ApprovalManager(context);

        // Load message history
        this._messages = context.globalState.get('sentinel.chatHistory', []);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message, data.files);
                    break;

                case 'selectAgent':
                    this._currentAgent = data.agent;
                    this.postMessage({ type: 'agentSelected', agent: data.agent });
                    break;

                case 'approveAction':
                    await this.approveAction(data.messageId, data.actionIndex);
                    break;

                case 'rejectAction':
                    await this.rejectAction(data.messageId, data.actionIndex);
                    break;

                case 'clearHistory':
                    await this.clearHistory();
                    break;

                case 'exportChat':
                    await this.exportChat();
                    break;

                case 'regenerate':
                    await this.regenerateResponse(data.messageId);
                    break;
            }
        });

        // Send initial state
        this.postMessage({
            type: 'init',
            messages: this._messages,
            agent: this._currentAgent,
            agents: this.getAvailableAgents()
        });
    }

    private async handleUserMessage(content: string, files?: string[]) {
        // Create user message
        const userMessage: Message = {
            id: this.generateId(),
            role: 'user',
            content,
            timestamp: Date.now()
        };

        this._messages.push(userMessage);
        this.postMessage({ type: 'message', message: userMessage });

        // Create assistant message (streaming)
        const assistantMessage: Message = {
            id: this.generateId(),
            role: 'assistant',
            content: '',
            agent: this._currentAgent,
            timestamp: Date.now(),
            status: 'streaming'
        };

        this._messages.push(assistantMessage);
        this.postMessage({ type: 'message', message: assistantMessage });

        try {
            // Build context from workspace
            const contextFiles = files || await this.getRelevantFiles(content);

            // Stream response from Sentinel
            await this._sentinelService.chatStream({
                message: content,
                agent: this._currentAgent,
                context: contextFiles,
                history: this._messages.slice(-10), // Last 10 messages
                onToken: (token: string) => {
                    assistantMessage.content += token;
                    this.postMessage({
                        type: 'streamToken',
                        messageId: assistantMessage.id,
                        token
                    });
                },
                onThinking: (thinking: string) => {
                    assistantMessage.thinking = thinking;
                    this.postMessage({
                        type: 'thinking',
                        messageId: assistantMessage.id,
                        thinking
                    });
                },
                onAction: async (action: Action) => {
                    // Request approval for write/execute actions
                    if (action.type === 'write' || action.type === 'execute') {
                        action.approved = await this.requestApproval(action);
                    } else {
                        action.approved = true;
                    }

                    if (!assistantMessage.actions) {
                        assistantMessage.actions = [];
                    }
                    assistantMessage.actions.push(action);

                    this.postMessage({
                        type: 'action',
                        messageId: assistantMessage.id,
                        action
                    });

                    return action.approved;
                },
                onComplete: () => {
                    assistantMessage.status = 'complete';
                    this.postMessage({
                        type: 'complete',
                        messageId: assistantMessage.id
                    });

                    // Save history
                    this.saveHistory();
                },
                onError: (error: string) => {
                    assistantMessage.status = 'error';
                    assistantMessage.content += `\n\n⚠️ Error: ${error}`;
                    this.postMessage({
                        type: 'error',
                        messageId: assistantMessage.id,
                        error
                    });

                    this.saveHistory();
                }
            });

        } catch (error: any) {
            assistantMessage.status = 'error';
            assistantMessage.content = `Error: ${error.message}`;
            this.postMessage({
                type: 'error',
                messageId: assistantMessage.id,
                error: error.message
            });

            this.saveHistory();
        }
    }

    private async buildContext(files: string[]): Promise<string> {
        let context = '';

        // Add workspace info
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            context += `Workspace: ${workspaceFolder.name}\n`;
            context += `Path: ${workspaceFolder.uri.fsPath}\n\n`;
        }

        // Add file contents
        for (const file of files.slice(0, 10)) { // Limit to 10 files
            try {
                const content = await this._fileOps.readFile(file);
                const relativePath = path.relative(workspaceFolder?.uri.fsPath || '', file);
                context += `File: ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
            } catch (error) {
                console.error(`Failed to read file ${file}:`, error);
            }
        }

        // Add current editor selection if any
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            const selection = editor.document.getText(editor.selection);
            context += `Selected code:\n\`\`\`\n${selection}\n\`\`\`\n\n`;
        }

        return context;
    }

    private async getRelevantFiles(query: string): Promise<string[]> {
        // Use Sentinel's semantic search to find relevant files
        try {
            const results = await this._sentinelService.semanticSearch(query, { topK: 5 });
            return results.map((r: any) => r.file);
        } catch (error) {
            // Fallback to current file
            const editor = vscode.window.activeTextEditor;
            return editor ? [editor.document.uri.fsPath] : [];
        }
    }

    private async requestApproval(action: Action): Promise<boolean> {
        return await this._approvalManager.requestApproval({
            type: action.type,
            file: action.file,
            content: action.content,
            onApprove: async () => {
                this.postMessage({
                    type: 'actionApproved',
                    action
                });
            },
            onReject: () => {
                this.postMessage({
                    type: 'actionRejected',
                    action
                });
            }
        });
    }

    private async approveAction(messageId: string, actionIndex: number) {
        const message = this._messages.find(m => m.id === messageId);
        if (message?.actions?.[actionIndex]) {
            message.actions[actionIndex].approved = true;
            await this.executeAction(message.actions[actionIndex]);
        }
    }

    private async rejectAction(messageId: string, actionIndex: number) {
        const message = this._messages.find(m => m.id === messageId);
        if (message?.actions?.[actionIndex]) {
            message.actions[actionIndex].approved = false;
        }
    }

    private async executeAction(action: Action) {
        switch (action.type) {
            case 'write':
                if (action.file && action.content) {
                    await this._fileOps.writeFile(action.file, action.content);
                    vscode.window.showInformationMessage(`Written to ${action.file}`);
                }
                break;

            case 'execute':
                if (action.content) {
                    // Execute command
                    const terminal = vscode.window.createTerminal('Sentinel');
                    terminal.sendText(action.content);
                    terminal.show();
                }
                break;
        }
    }

    private async regenerateResponse(messageId: string) {
        // Find the user message before this assistant message
        const messageIndex = this._messages.findIndex(m => m.id === messageId);
        if (messageIndex > 0) {
            const userMessage = this._messages[messageIndex - 1];
            if (userMessage.role === 'user') {
                // Remove the old assistant message
                this._messages.splice(messageIndex, 1);

                // Regenerate
                await this.handleUserMessage(userMessage.content);
            }
        }
    }

    private getAvailableAgents() {
        return [
            {
                id: 'adaptive',
                name: 'Adaptive',
                description: 'Automatically selects best strategy',
                icon: '🎯'
            },
            {
                id: 'security',
                name: 'Security',
                description: 'Specialized in security analysis',
                icon: '🔒'
            },
            {
                id: 'architecture',
                name: 'Architecture',
                description: 'Specialized in code architecture',
                icon: '🏗️'
            },
            {
                id: 'api',
                name: 'API',
                description: 'Specialized in API design',
                icon: '🔌'
            },
            {
                id: 'database',
                name: 'Database',
                description: 'Specialized in database queries',
                icon: '💾'
            },
            {
                id: 'test',
                name: 'Testing',
                description: 'Specialized in testing',
                icon: '🧪'
            },
            {
                id: 'documentation',
                name: 'Documentation',
                description: 'Specialized in documentation',
                icon: '📚'
            }
        ];
    }

    private async clearHistory() {
        this._messages = [];
        await this.saveHistory();
        this.postMessage({ type: 'cleared' });
    }

    private async exportChat() {
        const content = this._messages.map(m => {
            return `### ${m.role.toUpperCase()} ${m.agent ? `[${m.agent}]` : ''}\n${m.content}\n`;
        }).join('\n---\n\n');

        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'] }
        });

        if (uri) {
            await this._fileOps.writeFile(uri.fsPath, content);
            vscode.window.showInformationMessage(`Chat exported to ${uri.fsPath}`);
        }
    }

    private async saveHistory() {
        await this._context.globalState.update('sentinel.chatHistory', this._messages);
    }

    private postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    public reveal() {
        this._view?.show?.(true);
    }

    public async sendMessage(message: string) {
        await this.handleUserMessage(message);
    }

    public selectAgent(agent: string) {
        this._currentAgent = agent;
        this.postMessage({ type: 'agentSelected', agent });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Sentinel AI Chat</title>
</head>
<body>
    <div id="app">
        <div id="agent-selector"></div>
        <div id="messages"></div>
        <div id="input-container">
            <textarea id="input" placeholder="Ask Sentinel AI anything..."></textarea>
            <div id="actions">
                <button id="send">Send</button>
                <button id="attach">Attach Files</button>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
