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
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
class TerminalManager {
    terminals = new Map();
    outputChannel;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Sentinel Terminal');
    }
    async executeCommand(command, cwd, options) {
        const config = vscode.workspace.getConfiguration('sentinel');
        const autoApprove = config.get('terminal.autoApprove', false);
        const timeout = options?.timeout || config.get('terminal.timeout', 30000);
        // If not auto-approved, ask for permission
        if (!autoApprove) {
            const choice = await vscode.window.showInformationMessage(`Execute command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`, 'Execute', 'Cancel');
            if (choice !== 'Execute') {
                throw new Error('Command execution cancelled by user');
            }
        }
        const startTime = Date.now();
        try {
            // Create a new terminal for this command
            const terminalName = options?.terminalName || 'Sentinel';
            let terminal = this.terminals.get(terminalName);
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    name: terminalName,
                    cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
                this.terminals.set(terminalName, terminal);
            }
            terminal.show();
            // Execute the command
            terminal.sendText(command);
            if (options?.showOutput !== false) {
                this.outputChannel.appendLine(`$ ${command}`);
                this.outputChannel.show();
            }
            // For simple commands, we can't easily capture output from the terminal
            // So we return a placeholder result
            return {
                stdout: 'Command sent to terminal',
                stderr: '',
                exitCode: 0,
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            throw new Error(`Failed to execute command: ${error.message}`);
        }
    }
    async executeInBackground(command, cwd) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const startTime = Date.now();
        try {
            const result = await execAsync(command, {
                cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                timeout: 60000,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            });
            return {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: 0,
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                exitCode: error.code || 1,
                duration: Date.now() - startTime
            };
        }
    }
    createTerminal(name, cwd) {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
        this.terminals.set(name, terminal);
        return terminal;
    }
    getTerminal(name) {
        return this.terminals.get(name);
    }
    closeTerminal(name) {
        const terminal = this.terminals.get(name);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(name);
        }
    }
    closeAllTerminals() {
        for (const [name, terminal] of this.terminals) {
            terminal.dispose();
        }
        this.terminals.clear();
    }
    dispose() {
        this.closeAllTerminals();
        this.outputChannel.dispose();
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=terminalManager.js.map