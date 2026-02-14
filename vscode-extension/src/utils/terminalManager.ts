import * as vscode from 'vscode';

export interface TerminalCommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
}

export class TerminalManager {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Sentinel Terminal');
    }

    async executeCommand(
        command: string,
        cwd?: string,
        options?: {
            timeout?: number;
            showOutput?: boolean;
            terminalName?: string;
        }
    ): Promise<TerminalCommandResult> {
        const config = vscode.workspace.getConfiguration('sentinel');
        const autoApprove = config.get('terminal.autoApprove', false);
        const timeout = options?.timeout || config.get('terminal.timeout', 30000);

        // If not auto-approved, ask for permission
        if (!autoApprove) {
            const choice = await vscode.window.showInformationMessage(
                `Execute command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`,
                'Execute',
                'Cancel'
            );
            
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

        } catch (error: any) {
            throw new Error(`Failed to execute command: ${error.message}`);
        }
    }

    async executeInBackground(
        command: string,
        cwd?: string
    ): Promise<TerminalCommandResult> {
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
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                exitCode: error.code || 1,
                duration: Date.now() - startTime
            };
        }
    }

    createTerminal(name: string, cwd?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
        
        this.terminals.set(name, terminal);
        return terminal;
    }

    getTerminal(name: string): vscode.Terminal | undefined {
        return this.terminals.get(name);
    }

    closeTerminal(name: string): void {
        const terminal = this.terminals.get(name);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(name);
        }
    }

    closeAllTerminals(): void {
        for (const [name, terminal] of this.terminals) {
            terminal.dispose();
        }
        this.terminals.clear();
    }

    dispose(): void {
        this.closeAllTerminals();
        this.outputChannel.dispose();
    }
}
