import * as vscode from 'vscode';
import { SentinelService } from '../services/sentinelService';
import { ChatProvider } from '../providers/chatProvider';
import { SidebarProvider } from '../providers/sidebarProvider';
import { IssueDiagnostics } from '../providers/issueDiagnostics';
import { FileOperations } from '../utils/fileOperations';
import { TerminalManager } from '../utils/terminalManager';
export declare function registerCommands(context: vscode.ExtensionContext, services: {
    sentinelService: SentinelService;
    chatProvider: ChatProvider;
    sidebarProvider: SidebarProvider;
    diagnostics: IssueDiagnostics;
    fileOps: FileOperations;
    terminalManager: TerminalManager;
}): void;
//# sourceMappingURL=index.d.ts.map