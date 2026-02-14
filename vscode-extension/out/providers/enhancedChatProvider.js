"use strict";
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
exports.EnhancedChatProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const approvalManager_1 = require("../managers/approvalManager");
class EnhancedChatProvider {
    _view;
    _messages = [];
    _currentAgent = 'adaptive';
    _context;
    _sentinelService;
    _fileOps;
    _approvalManager;
    constructor(context, sentinelService, fileOps) {
        this._context = context;
        this._sentinelService = sentinelService;
        this._fileOps = fileOps;
        this._approvalManager = new approvalManager_1.ApprovalManager(context);
        // Load message history
        this._messages = context.globalState.get('sentinel.chatHistory', []);
    }
    resolveWebviewView(webviewView, context, _token) {
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
    async handleUserMessage(content, files) {
        // Create user message
        const userMessage = {
            id: this.generateId(),
            role: 'user',
            content,
            timestamp: Date.now()
        };
        this._messages.push(userMessage);
        this.postMessage({ type: 'message', message: userMessage });
        // Create assistant message (streaming)
        const assistantMessage = {
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
            const context = await this.buildContext(contextFiles);
            // Stream response from Sentinel
            await this._sentinelService.chatStream({
                message: content,
                agent: this._currentAgent,
                context,
                history: this._messages.slice(-10), // Last 10 messages
                onToken: (token) => {
                    assistantMessage.content += token;
                    this.postMessage({
                        type: 'streamToken',
                        messageId: assistantMessage.id,
                        token
                    });
                },
                onThinking: (thinking) => {
                    assistantMessage.thinking = thinking;
                    this.postMessage({
                        type: 'thinking',
                        messageId: assistantMessage.id,
                        thinking
                    });
                },
                onAction: async (action) => {
                    // Request approval for write/execute actions
                    if (action.type === 'write' || action.type === 'execute') {
                        action.approved = await this.requestApproval(action);
                    }
                    else {
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
                onError: (error) => {
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
        }
        catch (error) {
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
    async buildContext(files) {
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
            }
            catch (error) {
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
    async getRelevantFiles(query) {
        // Use Sentinel's semantic search to find relevant files
        try {
            const results = await this._sentinelService.semanticSearch(query, { topK: 5 });
            return results.map((r) => r.file);
        }
        catch (error) {
            // Fallback to current file
            const editor = vscode.window.activeTextEditor;
            return editor ? [editor.document.uri.fsPath] : [];
        }
    }
    async requestApproval(action) {
        return await this._approvalManager.requestApproval({
            type: action.type,
            file: action.file,
            content: action.content,
            onApprove: () => {
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
    async approveAction(messageId, actionIndex) {
        const message = this._messages.find(m => m.id === messageId);
        if (message?.actions?.[actionIndex]) {
            message.actions[actionIndex].approved = true;
            await this.executeAction(message.actions[actionIndex]);
        }
    }
    async rejectAction(messageId, actionIndex) {
        const message = this._messages.find(m => m.id === messageId);
        if (message?.actions?.[actionIndex]) {
            message.actions[actionIndex].approved = false;
        }
    }
    async executeAction(action) {
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
    async regenerateResponse(messageId) {
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
    getAvailableAgents() {
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
    async clearHistory() {
        this._messages = [];
        await this.saveHistory();
        this.postMessage({ type: 'cleared' });
    }
    async exportChat() {
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
    async saveHistory() {
        await this._context.globalState.update('sentinel.chatHistory', this._messages);
    }
    postMessage(message) {
        this._view?.webview.postMessage(message);
    }
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    reveal() {
        this._view?.show?.(true);
    }
    async sendMessage(message) {
        await this.handleUserMessage(message);
    }
    selectAgent(agent) {
        this._currentAgent = agent;
        this.postMessage({ type: 'agentSelected', agent });
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.css'));
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
exports.EnhancedChatProvider = EnhancedChatProvider;
//# sourceMappingURL=enhancedChatProvider.js.map