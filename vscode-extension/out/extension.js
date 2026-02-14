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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sentinelService_1 = require("./services/sentinelService");
const chatProvider_1 = require("./providers/chatProvider");
const sidebarProvider_1 = require("./providers/sidebarProvider");
const fileOperations_1 = require("./utils/fileOperations");
const terminalManager_1 = require("./utils/terminalManager");
const issueDiagnostics_1 = require("./providers/issueDiagnostics");
const commands_1 = require("./commands");
let sentinelService;
let chatProvider;
let sidebarProvider;
let fileOperations;
let terminalManager;
let issueDiagnostics;
function activate(context) {
    console.log('🛡️ Sentinel AI extension is now active');
    // Initialize services
    sentinelService = new sentinelService_1.SentinelService();
    fileOperations = new fileOperations_1.FileOperations();
    terminalManager = new terminalManager_1.TerminalManager();
    issueDiagnostics = new issueDiagnostics_1.IssueDiagnostics();
    // Initialize providers
    chatProvider = new chatProvider_1.ChatProvider(context.extensionUri, sentinelService, fileOperations, terminalManager);
    sidebarProvider = new sidebarProvider_1.SidebarProvider(context.extensionUri, sentinelService);
    // Register webview providers
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('sentinel-issues', sidebarProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // Register commands
    (0, commands_1.registerCommands)(context, {
        sentinelService,
        chatProvider,
        sidebarProvider,
        diagnostics: issueDiagnostics,
        fileOps: fileOperations,
        terminalManager
    });
    // Setup file watchers for auto-analysis
    setupFileWatchers(context);
    // Show welcome message
    vscode.window.showInformationMessage('🛡️ Sentinel AI is ready! Press Ctrl+Shift+S to open chat or Ctrl+Shift+A to analyze.', 'Open Chat', 'Analyze File').then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('sentinel.openChat');
        }
        else if (selection === 'Analyze File') {
            vscode.commands.executeCommand('sentinel.analyze');
        }
    });
}
function setupFileWatchers(context) {
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
function deactivate() {
    console.log('🛡️ Sentinel AI extension is now deactivated');
    issueDiagnostics?.dispose();
    terminalManager?.dispose();
}
//# sourceMappingURL=extension.js.map