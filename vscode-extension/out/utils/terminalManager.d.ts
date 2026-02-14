import * as vscode from 'vscode';
export interface TerminalCommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
}
export declare class TerminalManager {
    private terminals;
    private outputChannel;
    constructor();
    executeCommand(command: string, cwd?: string, options?: {
        timeout?: number;
        showOutput?: boolean;
        terminalName?: string;
    }): Promise<TerminalCommandResult>;
    executeInBackground(command: string, cwd?: string): Promise<TerminalCommandResult>;
    createTerminal(name: string, cwd?: string): vscode.Terminal;
    getTerminal(name: string): vscode.Terminal | undefined;
    closeTerminal(name: string): void;
    closeAllTerminals(): void;
    dispose(): void;
}
//# sourceMappingURL=terminalManager.d.ts.map