"use strict";
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
exports.IssueDiagnostics = void 0;
const vscode = __importStar(require("vscode"));
class IssueDiagnostics {
    diagnosticCollection;
    codeActionsProvider;
    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('sentinel');
    }
    updateDiagnostics(issues) {
        const diagnosticsMap = new Map();
        for (const issue of issues) {
            const uri = vscode.Uri.file(issue.file);
            const range = new vscode.Range((issue.line || 1) - 1, 0, (issue.line || 1) - 1, 1000);
            const diagnostic = new vscode.Diagnostic(range, `${issue.title}: ${issue.description || issue.message}`, this.mapSeverity(issue.severity));
            diagnostic.code = issue.id;
            diagnostic.source = 'Sentinel';
            if (issue.fix) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(new vscode.Location(uri, range), `Suggested fix: ${issue.suggestion || issue.fix}`)
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
    clearDiagnostics() {
        this.diagnosticCollection.clear();
    }
    registerCodeActions(context) {
        const provider = vscode.languages.registerCodeActionsProvider({ pattern: '**/*' }, {
            provideCodeActions: (document, range, context) => {
                const actions = [];
                for (const diagnostic of context.diagnostics) {
                    if (diagnostic.source !== 'Sentinel')
                        continue;
                    // Create fix action
                    const fixAction = new vscode.CodeAction('🔧 Apply Sentinel Fix', vscode.CodeActionKind.QuickFix);
                    fixAction.command = {
                        command: 'sentinel.applyFix',
                        title: 'Apply Fix',
                        arguments: [diagnostic]
                    };
                    fixAction.diagnostics = [diagnostic];
                    fixAction.isPreferred = true;
                    actions.push(fixAction);
                    // Create ignore action
                    const ignoreAction = new vscode.CodeAction('🙈 Ignore Issue', vscode.CodeActionKind.QuickFix);
                    ignoreAction.command = {
                        command: 'sentinel.ignoreIssue',
                        title: 'Ignore Issue',
                        arguments: [diagnostic]
                    };
                    ignoreAction.diagnostics = [diagnostic];
                    actions.push(ignoreAction);
                    // Create explain action
                    const explainAction = new vscode.CodeAction('❓ Explain Issue', vscode.CodeActionKind.QuickFix);
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
        }, {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        });
        context.subscriptions.push(provider);
    }
    mapSeverity(severity) {
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
    dispose() {
        this.diagnosticCollection.dispose();
        this.codeActionsProvider?.dispose();
    }
}
exports.IssueDiagnostics = IssueDiagnostics;
//# sourceMappingURL=issueDiagnostics.js.map