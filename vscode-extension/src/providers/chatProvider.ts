import * as vscode from 'vscode';
import { SentinelService, ChatMessage, ToolCall } from '../services/sentinelService';
import { FileOperations } from '../utils/fileOperations';
import { TerminalManager } from '../utils/terminalManager';

/**
 * ChatProvider - Manages the VS Code webview panel for AI chat functionality.
 * 
 * This class handles:
 * - Creating and managing the chat webview panel
 * - Processing user messages and displaying AI responses
 * - Managing chat history state
 * - Handling tool calls from the AI
 * - Exporting chat conversations
 * 
 * @example
 * ```typescript
 * const chatProvider = new ChatProvider(
 *   extensionUri,
 *   sentinelService,
 *   fileOperations,
 *   terminalManager
 * );
 * chatProvider.open();
 * ```
 */
export class ChatProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private messages: ChatMessage[] = [];
    private disposables: vscode.Disposable[] = [];

    /**
     * Creates a new ChatProvider instance.
     * 
     * @param extensionUri - The URI of the extension directory
     * @param sentinelService - The Sentinel AI service for chat functionality
     * @param fileOperations - Utility for file system operations
     * @param terminalManager - Manager for terminal operations
     */
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly sentinelService: SentinelService,
        private readonly fileOperations: FileOperations,
        private readonly terminalManager: TerminalManager
    ) {}

    /**
     * Opens the chat panel. If the panel is already open, it will be revealed.
     * Creates a new webview panel with the chat interface if none exists.
     */
    public open(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'sentinelChat',
            'Sentinel AI Chat',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'sendMessage':
                        await this.handleUserMessage(message.text);
                        break;
                    case 'clearChat':
                        this.clearChat();
                        break;
                    case 'exportChat':
                        await this.exportChat();
                        break;
                    case 'getOpenFiles':
                        await this.sendOpenFiles();
                        break;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            undefined,
            this.disposables
        );

        this.addMessage({
            role: 'assistant',
            content: 'Hello! I am Sentinel AI, your code assistant. I can help you with code analysis, security scanning, explaining code, refactoring, generating tests, and more. How can I help you today?'
        });
    }

    /**
     * Handles user messages sent from the webview.
     * Sends the message to the AI service and displays the response.
     * 
     * @param text - The user's message text
     */
    private async handleUserMessage(text: string): Promise<void> {
        this.addMessage({
            role: 'user',
            content: text,
            timestamp: Date.now()
        });

        this.panel?.webview.postMessage({ type: 'typing', show: true });

        try {
            const config = vscode.workspace.getConfiguration('sentinel');
            const includeContext = config.get('chat.includeFileContext', true);
            const openFiles: string[] = [];

            if (includeContext) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    openFiles.push(editor.document.uri.fsPath);
                }
            }

            const result = await this.sentinelService.chat(text, {
                files: openFiles,
                history: this.messages
            });

            this.panel?.webview.postMessage({ type: 'typing', show: false });

            this.addMessage({
                role: 'assistant',
                content: result.response,
                timestamp: Date.now(),
                toolCalls: result.toolCalls
            });

        } catch (error: unknown) {
            this.panel?.webview.postMessage({ type: 'typing', show: false });
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            this.addMessage({
                role: 'assistant',
                content: 'Error: ' + errorMessage,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Sends the currently open file content to the webview for context.
     */
    private async sendOpenFiles(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const content = editor.document.getText();
            const fileName = editor.document.fileName;
            
            this.panel?.webview.postMessage({
                type: 'openFile',
                fileName,
                content: content.substring(0, 10000)
            });
        }
    }

    /**
     * Adds a message to the chat history and sends it to the webview.
     * 
     * @param message - The chat message to add
     */
    private addMessage(message: ChatMessage): void {
        this.messages.push(message);
        this.panel?.webview.postMessage({
            type: 'addMessage',
            message
        });
    }

    /**
     * Clears the chat history and resets the webview.
     */
    private clearChat(): void {
        this.messages = [];
        this.panel?.webview.postMessage({ type: 'clearChat' });
        
        this.addMessage({
            role: 'assistant',
            content: 'Chat cleared. How can I help you?'
        });
    }

    /**
     * Exports the chat history to a markdown file.
     * Prompts the user for a save location.
     */
    private async exportChat(): Promise<void> {
        const content = this.messages.map(m => {
            const role = m.role === 'user' ? 'You' : 'Sentinel';
            return role + ':\n' + m.content + '\n\n---\n\n';
        }).join('');

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('sentinel-chat.md'),
            filters: { 'Markdown': ['md'], 'Text': ['txt'] }
        });

        if (uri) {
            await this.fileOperations.writeFile(uri.fsPath, content);
            vscode.window.showInformationMessage('Chat exported successfully');
        }
    }

    /**
     * Generates the HTML content for the webview.
     * 
     * @returns The complete HTML string for the chat interface
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sentinel AI Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .header h1 {
            font-size: 14px;
            font-weight: 600;
        }

        .toolbar {
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }

        .toolbar button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .toolbar button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            display: flex;
            gap: 12px;
            max-width: 100%;
        }

        .message.user {
            flex-direction: row-reverse;
        }

        .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            flex-shrink: 0;
        }

        .message.assistant .avatar {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.user .avatar {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .message-content {
            max-width: calc(100% - 50px);
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .message.assistant .message-content {
            background: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-editor-foreground);
        }

        .message.user .message-content {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .typing-indicator {
            display: none;
            align-items: center;
            gap: 4px;
            padding: 12px 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .typing-indicator.active {
            display: flex;
        }

        .typing-dots {
            display: flex;
            gap: 4px;
        }

        .typing-dots span {
            width: 6px;
            height: 6px;
            background: var(--vscode-descriptionForeground);
            border-radius: 50%;
            animation: typing 1.4s infinite;
        }

        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
        }

        .input-container {
            padding: 12px 16px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }

        .input-wrapper {
            flex: 1;
        }

        #messageInput {
            width: 100%;
            padding: 10px 14px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 20px;
            font-size: 13px;
            outline: none;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            font-family: inherit;
        }

        #messageInput:focus {
            border-color: var(--vscode-focusBorder);
        }

        .icon-button {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }

        .icon-button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .icon-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="header">
        <span>🛡️</span>
        <h1>Sentinel AI Assistant</h1>
    </div>

    <div class="toolbar">
        <button onclick="clearChat()">🗑️ Clear</button>
        <button onclick="exportChat()">💾 Export</button>
        <button onclick="addContext()">📄 Add Context</button>
    </div>

    <div class="chat-container" id="chatContainer"></div>

    <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
        Sentinel is thinking...
    </div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea id="messageInput" placeholder="Ask me anything about your code..." rows="1"></textarea>
        </div>
        <button class="icon-button" onclick="sendMessage()" id="sendButton">➤</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const typingIndicator = document.getElementById('typingIndicator');
        const sendButton = document.getElementById('sendButton');

        messageInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            vscode.postMessage({
                type: 'sendMessage',
                text: text
            });

            messageInput.value = '';
            messageInput.style.height = 'auto';
        }

        function clearChat() {
            vscode.postMessage({ type: 'clearChat' });
        }

        function exportChat() {
            vscode.postMessage({ type: 'exportChat' });
        }

        function addContext() {
            vscode.postMessage({ type: 'getOpenFiles' });
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, '&')
                .replace(/</g, '<')
                .replace(/>/g, '>');
        }

        function formatMessage(content) {
            // Escape HTML
            let formatted = escapeHtml(content);
            
            // Format bold
            formatted = formatted.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            
            // Format italic
            formatted = formatted.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
            
            // Format inline code - using character codes to avoid template literal issues
            formatted = formatted.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            
            // Format code blocks
            formatted = formatted.replace(/\`\`\`(\\w+)?\\n?([\\s\\S]*?)\`\`\`/g, function(match, lang, code) {
                return '<pre><code>' + escapeHtml(code) + '</code></pre>';
            });
            
            // Format newlines
            formatted = formatted.replace(/\\n/g, '<br>');
            
            return formatted;
        }

        function addMessageToUI(message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + message.role;
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.textContent = message.role === 'user' ? '👤' : '🛡️';
            
            const content = document.createElement('div');
            content.className = 'message-content';
            content.innerHTML = formatMessage(message.content);
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);
            chatContainer.appendChild(messageDiv);
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        window.addEventListener('message', function(event) {
            const message = event.data;
            
            switch (message.type) {
                case 'addMessage':
                    addMessageToUI(message.message);
                    break;
                case 'clearChat':
                    chatContainer.innerHTML = '';
                    break;
                case 'typing':
                    typingIndicator.classList.toggle('active', message.show);
                    sendButton.disabled = message.show;
                    break;
                case 'openFile':
                    messageInput.value = messageInput.value + '\\n\\n[Context: ' + message.fileName + ']';
                    break;
            }
        });
    <\/script>
</body>
</html>`;
    }

    /**
     * Shows the chat panel (alias for open()).
     */
    public show(): void {
        this.open();
    }

    /**
     * Sends a message programmatically to the chat.
     * 
     * @param text - The message text to send
     */
    public async sendMessage(text: string): Promise<void> {
        await this.handleUserMessage(text);
    }

    /**
     * Clears the chat history.
     */
    public clearHistory(): void {
        this.clearChat();
    }

    /**
     * Gets a copy of the chat history.
     * 
     * @returns Array of chat messages
     */
    public getHistory(): ChatMessage[] {
        return [...this.messages];
    }

    /**
     * Disposes of the chat provider and all associated resources.
     * Cleans up the webview panel and all event listeners.
     */
    public dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.messages = [];
    }
}
