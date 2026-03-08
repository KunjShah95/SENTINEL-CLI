import * as vscode from 'vscode';
import { SentinelService } from './services/sentinelService';
import { EnhancedChatProvider } from './providers/enhancedChatProvider';
import { SidebarProvider } from './providers/sidebarProvider';
import { FileOperations } from './utils/fileOperations';
import { TerminalManager } from './utils/terminalManager';
import { IssueDiagnostics } from './providers/issueDiagnostics';
import { registerCommands } from './commands';

let sentinelService: SentinelService;
let chatProvider: EnhancedChatProvider;
let sidebarProvider: SidebarProvider;
let fileOperations: FileOperations;
let terminalManager: TerminalManager;
let issueDiagnostics: IssueDiagnostics;

export function activate(context: vscode.ExtensionContext) {
    console.log(' Sentinel AI extension is now active');

    // Initialize services
    sentinelService = new SentinelService();
    fileOperations = new FileOperations();
    terminalManager = new TerminalManager();
    issueDiagnostics = new IssueDiagnostics();

    // Initialize providers
    chatProvider = new EnhancedChatProvider(context, sentinelService, fileOperations);
    sidebarProvider = new SidebarProvider(context.extensionUri, sentinelService);

    // Register webview providers
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sentinel-issues', sidebarProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.registerWebviewViewProvider('sentinel-chat-history', chatProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Register commands
    registerCommands(context, {
        sentinelService,
        chatProvider,
        sidebarProvider,
        fileOps: fileOperations,
        terminalManager,
        diagnostics: issueDiagnostics
    });

    // Setup file watchers for auto-analysis
    setupFileWatchers(context);

    // Show welcome message
    vscode.window.showInformationMessage(
        '🛡️ Sentinel AI is ready! Press Ctrl+Shift+S to open chat or Ctrl+Shift+A to analyze.',
        'Open Chat',
        'Analyze File'
    ).then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('sentinel.openChat');
        } else if (selection === 'Analyze File') {
            vscode.commands.executeCommand('sentinel.analyze');
        }
    });
}

function setupFileWatchers(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('sentinel');
    
    if (config.get('autoAnalyze', false)) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,ts,jsx,tsx,py,go,java}');
        
        watcher.onDidChange(uri => {
            // Debounce analysis
            setTimeout(() => {
                sentinelService.analyzeFile(uri.fsPath).then(result => {
                    issueDiagnostics.updateDiagnostics(result.issues);
                });
            }, 1000);
        });

        context.subscriptions.push(watcher);
    }
}

export function deactivate() {
    console.log('🛡️ Sentinel AI extension is now deactivated');
    issueDiagnostics?.dispose();
    terminalManager?.dispose();
}
