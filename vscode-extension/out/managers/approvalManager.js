"use strict";
/**
 * APPROVAL MANAGER
 *
 * Handles file change approvals with diff views
 * Similar to Cline's approval system
 */
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
exports.ApprovalManager = void 0;
const vscode = __importStar(require("vscode"));
const diff = __importStar(require("diff"));
const path = __importStar(require("path"));
class ApprovalManager {
    _context;
    _pendingApprovals = new Map();
    constructor(context) {
        this._context = context;
    }
    async requestApproval(request) {
        const id = this.generateId();
        this._pendingApprovals.set(id, request);
        // Show different UI based on request type
        if (request.type === 'write' && request.file) {
            return await this.showFileDiffApproval(id, request);
        }
        else if (request.type === 'execute') {
            return await this.showExecuteApproval(id, request);
        }
        else if (request.type === 'delete') {
            return await this.showDeleteApproval(id, request);
        }
        return false;
    }
    async showFileDiffApproval(id, request) {
        const file = request.file;
        const newContent = request.content;
        try {
            // Read original content
            const originalUri = vscode.Uri.file(file);
            let originalContent = '';
            try {
                const doc = await vscode.workspace.openTextDocument(originalUri);
                originalContent = doc.getText();
            }
            catch (error) {
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
            await vscode.commands.executeCommand('vscode.diff', originalUri.with({ scheme: originalContent ? 'file' : 'untitled' }), tempDoc.uri, `${path.basename(file)} (Proposed Changes)`, { preview: true });
            // Calculate diff stats
            const patches = diff.diffLines(originalContent, newContent);
            const additions = patches.filter(p => p.added).reduce((sum, p) => sum + (p.count || 0), 0);
            const deletions = patches.filter(p => p.removed).reduce((sum, p) => sum + (p.count || 0), 0);
            // Show approval dialog
            const result = await vscode.window.showInformationMessage(`Approve changes to ${path.basename(file)}?\n+${additions} -${deletions} lines`, { modal: true }, 'Approve', 'Reject', 'Show Details');
            if (result === 'Approve') {
                await request.onApprove();
                this._pendingApprovals.delete(id);
                return true;
            }
            else if (result === 'Show Details') {
                // Show detailed diff in webview
                await this.showDetailedDiff(originalContent, newContent, file);
                return await this.showFileDiffApproval(id, request); // Ask again
            }
            else {
                request.onReject();
                this._pendingApprovals.delete(id);
                return false;
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }
    async showExecuteApproval(id, request) {
        const command = request.content;
        const result = await vscode.window.showWarningMessage(`Execute command: ${command}`, { modal: true }, 'Execute', 'Cancel');
        if (result === 'Execute') {
            await request.onApprove();
            this._pendingApprovals.delete(id);
            return true;
        }
        else {
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }
    async showDeleteApproval(id, request) {
        const file = request.file;
        const result = await vscode.window.showWarningMessage(`Delete file: ${path.basename(file)}?`, { modal: true }, 'Delete', 'Cancel');
        if (result === 'Delete') {
            await request.onApprove();
            this._pendingApprovals.delete(id);
            return true;
        }
        else {
            request.onReject();
            this._pendingApprovals.delete(id);
            return false;
        }
    }
    async showDetailedDiff(original, modified, filename) {
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
    async approve(approvalId) {
        const request = this._pendingApprovals.get(approvalId);
        if (request) {
            await request.onApprove();
            this._pendingApprovals.delete(approvalId);
        }
    }
    async reject(approvalId) {
        const request = this._pendingApprovals.get(approvalId);
        if (request) {
            request.onReject();
            this._pendingApprovals.delete(approvalId);
        }
    }
    async showDiff(approvalId) {
        const request = this._pendingApprovals.get(approvalId);
        if (request && request.file) {
            await this.showFileDiffApproval(approvalId, request);
        }
    }
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}
exports.ApprovalManager = ApprovalManager;
//# sourceMappingURL=approvalManager.js.map