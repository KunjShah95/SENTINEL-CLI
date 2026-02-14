import * as vscode from 'vscode';
import { SentinelService, AnalysisIssue } from '../services/sentinelService';
import { ChatProvider } from '../providers/chatProvider';
import { SidebarProvider } from '../providers/sidebarProvider';
import { IssueDiagnostics } from '../providers/issueDiagnostics';
import { FileOperations } from '../utils/fileOperations';
import { TerminalManager } from '../utils/terminalManager';

export function registerCommands(
    context: vscode.ExtensionContext,
    services: {
        sentinelService: SentinelService;
        chatProvider: ChatProvider;
        sidebarProvider: SidebarProvider;
        diagnostics: IssueDiagnostics;
        fileOps: FileOperations;
        terminalManager: TerminalManager;
    }
): void {
    const { sentinelService, chatProvider, sidebarProvider, diagnostics, fileOps, terminalManager } = services;

    // Open AI Chat
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.openChat', () => {
            chatProvider.open();
        })
    );

    // Analyze current file
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.analyze', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open to analyze');
                return;
            }

            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Analyzing file with Sentinel...',
                    cancellable: false
                }, async () => {
                    const result = await sentinelService.analyzeFile(editor.document.fileName);
                    diagnostics.updateDiagnostics(result.issues);
                    sidebarProvider.updateIssues(result.issues);
                    
                    const summary = result.summary;
                    vscode.window.showInformationMessage(
                        `Analysis complete: ${summary.total} issues found (${summary.critical} critical, ${summary.high} high)`
                    );
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            }
        })
    );

    // Analyze folder
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.analyzeFolder', async (uri: vscode.Uri) => {
            const folderPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!folderPath) {
                vscode.window.showWarningMessage('No folder selected');
                return;
            }

            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Analyzing folder with Sentinel...',
                    cancellable: false
                }, async () => {
                    const result = await sentinelService.analyzeFolder(folderPath);
                    diagnostics.updateDiagnostics(result.issues);
                    sidebarProvider.updateIssues(result.issues);
                    
                    vscode.window.showInformationMessage(
                        `Folder analysis complete: ${result.summary.total} issues found`
                    );
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Folder analysis failed: ${error.message}`);
            }
        })
    );

    // Security audit
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.securityAudit', async () => {
            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running security audit...',
                    cancellable: false
                }, async () => {
                    const result = await sentinelService.securityAudit();
                    diagnostics.updateDiagnostics(result.issues);
                    sidebarProvider.updateIssues(result.issues);
                    
                    vscode.window.showInformationMessage(
                        `Security audit complete: ${result.summary.total} vulnerabilities found`
                    );
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Security audit failed: ${error.message}`);
            }
        })
    );

    // Full scan
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.fullScan', async () => {
            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running full project scan...',
                    cancellable: false
                }, async () => {
                    const result = await sentinelService.fullScan();
                    diagnostics.updateDiagnostics(result.issues);
                    sidebarProvider.updateIssues(result.issues);
                    
                    vscode.window.showInformationMessage(
                        `Full scan complete: ${result.summary.total} issues found`
                    );
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Full scan failed: ${error.message}`);
            }
        })
    );

    // Auto fix
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.autoFix', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open');
                return;
            }

            try {
                const result = await sentinelService.autoFix();
                vscode.window.showInformationMessage(`Auto-fix applied: ${result.applied} fixes`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Auto-fix failed: ${error.message}`);
            }
        })
    );

    // Explain code
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Please select code to explain');
                return;
            }

            try {
                const language = editor.document.languageId;
                const explanation = await sentinelService.explainCode(selection, language);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Code Explanation\n\n## Selected Code\n\`\`\`${language}\n${selection}\n\`\`\`\n\n## Explanation\n${explanation}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to explain code: ${error.message}`);
            }
        })
    );

    // Refactor code
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.refactorCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('Please select code to refactor');
                return;
            }

            try {
                const result = await sentinelService.refactorCode(selection);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Code Refactoring\n\n## Original Code\n\`\`\`\n${selection}\n\`\`\`\n\n## Refactored Code\n\`\`\`\n${result.refactored}\n\`\`\`\n\n## Explanation\n${result.explanation}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to refactor code: ${error.message}`);
            }
        })
    );

    // Generate tests
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.generateTests', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open');
                return;
            }

            const content = editor.document.getText();
            const fileName = editor.document.fileName;
            const language = editor.document.languageId;

            try {
                const tests = await sentinelService.generateTests(content, language);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Unit Tests for ${fileName}\n\n${tests}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to generate tests: ${error.message}`);
            }
        })
    );

    // Document code
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.documentCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open');
                return;
            }

            const content = editor.document.getText();
            const language = editor.document.languageId;

            try {
                const docs = await sentinelService.documentCode(content, language);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Code Documentation\n\n${docs}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to document code: ${error.message}`);
            }
        })
    );

    // Scan secrets
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.scanSecrets', async () => {
            try {
                const result = await sentinelService.scanSecrets();
                diagnostics.updateDiagnostics(result.issues);
                sidebarProvider.updateIssues(result.issues);
                
                vscode.window.showInformationMessage(
                    `Secret scan complete: ${result.summary.total} potential secrets found`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`Secret scan failed: ${error.message}`);
            }
        })
    );

    // Pre-commit check
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.preCommit', async () => {
            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Running pre-commit checks...',
                    cancellable: false
                }, async () => {
                    const result = await sentinelService.preCommitCheck();
                    
                    if (result.blocked) {
                        vscode.window.showErrorMessage(
                            `Pre-commit check failed: ${result.issues.length} blocking issues found`
                        );
                    } else {
                        vscode.window.showInformationMessage('Pre-commit checks passed');
                    }
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Pre-commit check failed: ${error.message}`);
            }
        })
    );

    // Clear chat
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.clearChat', () => {
            chatProvider.open();
            vscode.window.showInformationMessage('Use the chat UI to clear history');
        })
    );

    // Export chat
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.exportChat', async () => {
            chatProvider.open();
            vscode.window.showInformationMessage('Use the chat UI to export');
        })
    );

    // Show settings
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.showSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'sentinel');
        })
    );

    // Refresh sidebar
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.refreshSidebar', async () => {
            try {
                const result = await sentinelService.fullScan();
                diagnostics.updateDiagnostics(result.issues);
                sidebarProvider.updateIssues(result.issues);
                vscode.window.showInformationMessage(`Refreshed: ${result.summary.total} issues found`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Refresh failed: ${error.message}`);
            }
        })
    );

    // Apply fix (internal)
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.applyFix', async (issue: AnalysisIssue) => {
            if (!issue.fix) {
                vscode.window.showWarningMessage('No fix available for this issue');
                return;
            }

            try {
                const filePath = issue.file;
                const content = await fileOps.readFile(filePath);
                
                const fixedContent = content.replace(issue.code || '', issue.fix);
                await fileOps.writeFile(filePath, fixedContent);
                
                vscode.window.showInformationMessage('Fix applied');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to apply fix: ${error.message}`);
            }
        })
    );

    // Ignore issue (internal)
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.ignoreIssue', async (issue: AnalysisIssue) => {
            const config = vscode.workspace.getConfiguration('sentinel');
            const ignored = config.get<string[]>('ignoredIssues', []);
            ignored.push(issue.title);
            await config.update('ignoredIssues', ignored, true);
            
            vscode.window.showInformationMessage('Issue ignored');
        })
    );
}
