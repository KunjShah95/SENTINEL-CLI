import * as vscode from 'vscode';
import { AnalysisIssue } from '../services/sentinelService';

export class IssueDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private codeActionsProvider?: vscode.Disposable;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('sentinel');
    }

    public updateDiagnostics(issues: AnalysisIssue[]): void {
        const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

        for (const issue of issues) {
            const uri = vscode.Uri.file(issue.file);
            const range = new vscode.Range(
                (issue.line || 1) - 1,
                0,
                (issue.line || 1) - 1,
                1000
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                `${issue.title}: ${issue.message}`,
                this.mapSeverity(issue.severity)
            );

            diagnostic.code = issue.id;
            diagnostic.source = 'Sentinel';
            
            if (issue.fix) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(uri, range),
                        `Suggested fix: ${issue.suggestion || issue.fix}`
                    )
                ];
            }

            const existing = diagnosticsMap.get(uri.toString()) || [];
            existing.push(diagnostic);
            diagnosticsMap.set(uri.toString(), existing);
        }

        this.diagnosticCollection.clear();
        for (const [uri, diagnostics] of diagnosticsMap) {
            this.diagnosticCollection.set(vscode.Uri.parse(uri), diagnostics);
        }
    }

    public clearDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    public registerCodeActions(context: vscode.ExtensionContext): void {
        const provider = vscode.languages.registerCodeActionsProvider(
            { pattern: '**/*' },
            {
                provideCodeActions: (document, range, context) => {
                    const actions: vscode.CodeAction[] = [];
                    
                    for (const diagnostic of context.diagnostics) {
                        if (diagnostic.source !== 'Sentinel') continue;

                        // Create fix action
                        const fixAction = new vscode.CodeAction(
                            '🔧 Apply Sentinel Fix',
                            vscode.CodeActionKind.QuickFix
                        );
                        fixAction.command = {
                            command: 'sentinel.applyFix',
                            title: 'Apply Fix',
                            arguments: [diagnostic]
                        };
                        fixAction.diagnostics = [diagnostic];
                        fixAction.isPreferred = true;
                        actions.push(fixAction);

                        // Create ignore action
                        const ignoreAction = new vscode.CodeAction(
                            '🙈 Ignore Issue',
                            vscode.CodeActionKind.QuickFix
                        );
                        ignoreAction.command = {
                            command: 'sentinel.ignoreIssue',
                            title: 'Ignore Issue',
                            arguments: [diagnostic]
                        };
                        ignoreAction.diagnostics = [diagnostic];
                        actions.push(ignoreAction);

                        // Create explain action
                        const explainAction = new vscode.CodeAction(
                            '❓ Explain Issue',
                            vscode.CodeActionKind.QuickFix
                        );
                        explainAction.command = {
                            command: 'sentinel.explainCode',
                            title: 'Explain',
                            arguments: [document, range]
                        };
                        explainAction.diagnostics = [diagnostic];
                        actions.push(explainAction);
                    }

                    return actions;
                }
            },
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        );

        context.subscriptions.push(provider);
    }

    private mapSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'critical':
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'medium':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
        this.codeActionsProvider?.dispose();
    }
}
