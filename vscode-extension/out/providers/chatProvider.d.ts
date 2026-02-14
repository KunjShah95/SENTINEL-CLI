import * as vscode from 'vscode';
import { SentinelService, ChatMessage } from '../services/sentinelService';
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
export declare class ChatProvider implements vscode.Disposable {
    private readonly extensionUri;
    private readonly sentinelService;
    private readonly fileOperations;
    private readonly terminalManager;
    private panel;
    private messages;
    private disposables;
    /**
     * Creates a new ChatProvider instance.
     *
     * @param extensionUri - The URI of the extension directory
     * @param sentinelService - The Sentinel AI service for chat functionality
     * @param fileOperations - Utility for file system operations
     * @param terminalManager - Manager for terminal operations
     */
    constructor(extensionUri: vscode.Uri, sentinelService: SentinelService, fileOperations: FileOperations, terminalManager: TerminalManager);
    /**
     * Opens the chat panel. If the panel is already open, it will be revealed.
     * Creates a new webview panel with the chat interface if none exists.
     */
    open(): void;
    /**
     * Handles user messages sent from the webview.
     * Sends the message to the AI service and displays the response.
     *
     * @param text - The user's message text
     */
    private handleUserMessage;
    /**
     * Sends the currently open file content to the webview for context.
     */
    private sendOpenFiles;
    /**
     * Adds a message to the chat history and sends it to the webview.
     *
     * @param message - The chat message to add
     */
    private addMessage;
    /**
     * Clears the chat history and resets the webview.
     */
    private clearChat;
    /**
     * Exports the chat history to a markdown file.
     * Prompts the user for a save location.
     */
    private exportChat;
    /**
     * Generates the HTML content for the webview.
     *
     * @returns The complete HTML string for the chat interface
     */
    private getWebviewContent;
    /**
     * Shows the chat panel (alias for open()).
     */
    show(): void;
    /**
     * Sends a message programmatically to the chat.
     *
     * @param text - The message text to send
     */
    sendMessage(text: string): Promise<void>;
    /**
     * Clears the chat history.
     */
    clearHistory(): void;
    /**
     * Gets a copy of the chat history.
     *
     * @returns Array of chat messages
     */
    getHistory(): ChatMessage[];
    /**
     * Disposes of the chat provider and all associated resources.
     * Cleans up the webview panel and all event listeners.
     */
    dispose(): void;
}
//# sourceMappingURL=chatProvider.d.ts.map