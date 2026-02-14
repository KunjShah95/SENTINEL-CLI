/**
 * APPROVAL MANAGER
 *
 * Handles file change approvals with diff views
 * Similar to Cline's approval system
 */

import * as vscode from 'vscode';
import * as diff from 'diff';
import * as path from 'path';

interface ApprovalRequest {
    type: 'write' | 'execute' | 'delete';
    file?: string;
    content?: string;
    originalContent?: string;
    onApprove: () => Promise<void>;
    onReject: () => void;
}

export class ApprovalManager {
    private _context: vscode.ExtensionContext;
    private _pendingApprovals: Map<string, ApprovalRequest> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public async requestApproval(request: ApprovalRequest): Promise<boolean> {
        const id = this.generateId();
        this._pendingApprovals.set(id, request);

        // Show different UI based on request type
        if (request.type === 'write' && request.file) {
            return await this.showFileDiffApproval(id, request);
        } else if (request.type === 'execute') {
            return await this.showExecuteApproval(id, request);
        } else if (request.type === 'delete') {
            return await this.showDeleteApproval(id, request);
        }

        return false;
    }

    private async showFileDiffApproval(id: string, request: ApprovalRequest): Promise<boolean> {
        const file = request.file!;
        const newContent = request.content!;

        try {
            // Read original content
            const originalUri = vscode.Uri.file(file);
            let originalContent = '';

            try {
                const doc = await vscode.workspace.openTextDocument(originalUri);
                originalContent = doc.getText();
            } catch (error) {
                // File doesn't exist yet
                originalContent = '';
            }

            // Create temp file with new content
            const tempUri = originalUri.with({ scheme: 'untitled', path: file + '.proposed' });
            const tempDoc = await vscode.workspace.openTextDocument(tempUri);
            const edit = new vscode.WorkspaceEdit();
            edit.insert(tempUri, new vscode.Position(0, 0), newContent);
            await vscode.workspace.applyEdit(edit);

            // Show diff
            await vscode.commands.executeCommand(
                'vscode.diff',
                originalUri.with({ scheme: originalContent ? 'file' : 'untitled' }),
                tempDoc.uri,
                `${path.basename(file)} (Proposed Changes)`,
                { preview: true }
            );

            // Calculate diff stats
            const patches = diff.diffLines(originalContent, newContent);
            const additions = patches.filter(p => p.added).reduce((sum, p) => sum + (p.count || 0), 0);
            const deletions = patches.filter(p => p.removed).reduce((sum, p) => sum + (p.count || 0), 0);

            // Show approval dialog
            const result = await vscode.window.showInformationMessage(
                `Approve changes to ${path.basename(file)}?\n+${additions} -${deletions} lines`,
                { modal: true },
                'Approve',
                'Reject',
                'Show Details'
            );

            if (result === 'Approve') {
                await request.onApprove();
                this._pendingApprovals.delete(id);
                return true;
            } else if (result === 'Show Details') {
                // Show detailed diff in webview
                await this.showDetailedDiff(originalContent, newContent, file);
                return await this.showFileDiffApproval(id, request); // Ask again
            } else {
                request.onReject();
                this._pendingApprovals.delete(id);
                return false;
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }

    private async showExecuteApproval(id: string, request: ApprovalRequest): Promise<boolean> {
        const command = request.content!;

        const result = await vscode.window.showWarningMessage(
            `Execute command: ${command}`,
            { modal: true },
            'Execute',
            'Cancel'
        );

        if (result === 'Execute') {
            await request.onApprove();
            this._pendingApprovals.delete(id);
            return true;
        } else {
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }

    private async showDeleteApproval(id: string, request: ApprovalRequest): Promise<boolean> {
        const file = request.file!;

        const result = await vscode.window.showWarningMessage(
            `Delete file: ${path.basename(file)}?`,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (result === 'Delete') {
            await request.onApprove();
            this._pendingApprovals.delete(id);
            return true;
        } else {
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }

    private async showDetailedDiff(original: string, modified: string, filename: string) {
        const patches = diff.createPatch(filename, original, modified, 'Original', 'Proposed');

        const doc = await vscode.workspace.openTextDocument({
            content: patches,
            language: 'diff'
        });

        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });
    }

    public async approve(approvalId: string) {
        const request = this._pendingApprovals.get(approvalId);
        if (request) {
            await request.onApprove();
            this._pendingApprovals.delete(approvalId);
        }
    }

    public async reject(approvalId: string) {
        const request = this._pendingApprovals.get(approvalId);
        if (request) {
            request.onReject();
            this._pendingApprovals.delete(approvalId);
        }
    }

    public async showDiff(approvalId: string) {
        const request = this._pendingApprovals.get(approvalId);
        if (request && request.file) {
            await this.showFileDiffApproval(approvalId, request);
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}
