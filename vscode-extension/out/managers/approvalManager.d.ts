/**
 * APPROVAL MANAGER
 *
 * Handles file change approvals with diff views
 * Similar to Cline's approval system
 */
import * as vscode from 'vscode';
interface ApprovalRequest {
    type: 'write' | 'execute' | 'delete';
    file?: string;
    content?: string;
    originalContent?: string;
    onApprove: () => Promise<void>;
    onReject: () => void;
}
export declare class ApprovalManager {
    private _context;
    private _pendingApprovals;
    constructor(context: vscode.ExtensionContext);
    requestApproval(request: ApprovalRequest): Promise<boolean>;
    private showFileDiffApproval;
    private showExecuteApproval;
    private showDeleteApproval;
    private showDetailedDiff;
    approve(approvalId: string): Promise<void>;
    reject(approvalId: string): Promise<void>;
    showDiff(approvalId: string): Promise<void>;
    private generateId;
}
export {};
//# sourceMappingURL=approvalManager.d.ts.map