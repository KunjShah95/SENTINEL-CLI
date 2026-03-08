import * as vscode from 'vscode';
import { SentinelService } from '../services/sentinelService';
import { EnhancedChatProvider } from '../providers/enhancedChatProvider';
import { SidebarProvider } from '../providers/sidebarProvider';
import { IssueDiagnostics } from '../providers/issueDiagnostics';
import { FileOperations } from '../utils/fileOperations';
import { TerminalManager } from '../utils/terminalManager';
export declare function registerCommands(context: vscode.ExtensionContext, services: {
    sentinelService: SentinelService;
    chatProvider: EnhancedChatProvider;
    sidebarProvider: SidebarProvider;
    diagnostics: IssueDiagnostics;
    fileOps: FileOperations;
    terminalManager: TerminalManager;
}): void;
//# sourceMappingURL=index.d.ts.map