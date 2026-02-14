import * as vscode from 'vscode';
import { SentinelService, AnalysisIssue } from '../services/sentinelService';
export declare class SidebarProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    private readonly sentinelService;
    private view?;
    private issues;
    constructor(extensionUri: vscode.Uri, sentinelService: SentinelService);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    updateIssues(issues: AnalysisIssue[]): void;
    private groupIssuesBySeverity;
    private refreshIssues;
    private openFile;
    private getHtmlContent;
}
//# sourceMappingURL=sidebarProvider.d.ts.map