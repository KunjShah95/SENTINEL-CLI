import * as vscode from 'vscode';
import { AnalysisIssue } from '../services/sentinelService';
export declare class IssueDiagnostics {
    private diagnosticCollection;
    private codeActionsProvider?;
    constructor();
    updateDiagnostics(issues: AnalysisIssue[]): void;
    clearDiagnostics(): void;
    registerCodeActions(context: vscode.ExtensionContext): void;
    private mapSeverity;
    dispose(): void;
}
//# sourceMappingURL=issueDiagnostics.d.ts.map