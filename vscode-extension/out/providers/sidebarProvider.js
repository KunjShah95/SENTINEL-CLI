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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
class SidebarProvider {
    extensionUri;
    sentinelService;
    view;
    issues = [];
    constructor(extensionUri, sentinelService) {
        this.extensionUri = extensionUri;
        this.sentinelService = sentinelService;
    }
    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.html = this.getHtmlContent();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'refresh':
                    await this.refreshIssues();
                    break;
                case 'openFile':
                    this.openFile(message.file, message.line);
                    break;
                case 'applyFix':
                    vscode.commands.executeCommand('sentinel.applyFix', message.issue);
                    break;
                case 'ignoreIssue':
                    vscode.commands.executeCommand('sentinel.ignoreIssue', message.issue);
                    break;
            }
        });
    }
    updateIssues(issues) {
        this.issues = issues;
        this.view?.webview.postMessage({
            type: 'updateIssues',
            issues: this.groupIssuesBySeverity(issues)
        });
    }
    groupIssuesBySeverity(issues) {
        const grouped = {
            critical: issues.filter(i => i.severity === 'critical'),
            high: issues.filter(i => i.severity === 'high'),
            medium: issues.filter(i => i.severity === 'medium'),
            low: issues.filter(i => i.severity === 'low'),
            info: issues.filter(i => i.severity === 'info')
        };
        return {
            summary: {
                total: issues.length,
                critical: grouped.critical.length,
                high: grouped.high.length,
                medium: grouped.medium.length,
                low: grouped.low.length,
                info: grouped.info.length
            },
            issues: grouped
        };
    }
    async refreshIssues() {
        try {
            const result = await this.sentinelService.fullScan();
            this.updateIssues(result.issues);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh: ${error.message}`);
        }
    }
    openFile(file, line) {
        const uri = vscode.Uri.file(file);
        vscode.window.showTextDocument(uri, {
            selection: line ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined
        });
    }
    getHtmlContent() {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 10px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 16px;
        }
        .stat-box {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px;
            border-radius: 4px;
            text-align: center;
        }
        .stat-number {
            font-size: 20px;
            font-weight: bold;
        }
        .stat-label {
            font-size: 11px;
            opacity: 0.8;
        }
        .critical { color: #f44336; }
        .high { color: #ff9800; }
        .medium { color: #ffc107; }
        .low { color: #4caf50; }
        .info { color: #2196f3; }
        
        .section {
            margin-bottom: 12px;
        }
        .section-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px;
            background: var(--vscode-titleBar-activeBackground);
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }
        .section-content {
            padding-left: 12px;
        }
        .issue-item {
            padding: 8px;
            margin: 4px 0;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            cursor: pointer;
            border-left: 3px solid transparent;
        }
        .issue-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .issue-title {
            font-weight: 500;
            margin-bottom: 2px;
        }
        .issue-location {
            font-size: 11px;
            opacity: 0.7;
        }
        .issue-actions {
            display: flex;
            gap: 4px;
            margin-top: 6px;
        }
        .issue-actions button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 2px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        .empty-state {
            text-align: center;
            padding: 20px;
            opacity: 0.6;
        }
        .refresh-btn {
            width: 100%;
            padding: 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <button class="refresh-btn" onclick="refresh()">🔄 Refresh Analysis</button>
    
    <div class="summary" id="summary">
        <div class="stat-box">
            <div class="stat-number critical" id="criticalCount">0</div>
            <div class="stat-label">Critical</div>
        </div>
        <div class="stat-box">
            <div class="stat-number high" id="highCount">0</div>
            <div class="stat-label">High</div>
        </div>
        <div class="stat-box">
            <div class="stat-number medium" id="mediumCount">0</div>
            <div class="stat-label">Medium</div>
        </div>
    </div>

    <div id="issuesContainer">
        <div class="empty-state">No issues found. Click Refresh to analyze.</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        function openFile(file, line) {
            vscode.postMessage({ type: 'openFile', file, line });
        }

        function applyFix(issue) {
            vscode.postMessage({ type: 'applyFix', issue });
        }

        function ignoreIssue(issue) {
            vscode.postMessage({ type: 'ignoreIssue', issue });
        }

        function toggleSection(severity) {
            const content = document.getElementById(severity + 'Issues');
            if (content) {
                content.style.display = content.style.display === 'none' ? 'block' : 'none';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.type === 'updateIssues') {
                const data = message.issues;
                
                // Update summary
                document.getElementById('criticalCount').textContent = data.summary.critical;
                document.getElementById('highCount').textContent = data.summary.high;
                document.getElementById('mediumCount').textContent = data.summary.medium;
                
                // Build issues list
                const container = document.getElementById('issuesContainer');
                container.innerHTML = '';
                
                const severities = ['critical', 'high', 'medium', 'low', 'info'];
                const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };
                
                for (const severity of severities) {
                    const issues = data.issues[severity];
                    if (issues.length === 0) continue;
                    
                    const section = document.createElement('div');
                    section.className = 'section';
                    
                    const header = document.createElement('div');
                    header.className = 'section-header';
                    header.innerHTML = icons[severity] + ' ' + severity.toUpperCase() + ' (' + issues.length + ')';
                    header.onclick = () => toggleSection(severity);
                    
                    const content = document.createElement('div');
                    content.className = 'section-content';
                    content.id = severity + 'Issues';
                    
                    for (const issue of issues) {
                        const item = document.createElement('div');
                        item.className = 'issue-item';
                        item.style.borderLeftColor = 'var(--vscode-' + severity + ')';
                        item.innerHTML = 
                            '<div class="issue-title">' + escapeHtml(issue.title) + '</div>' +
                            '<div class="issue-location">' + issue.file + ':' + (issue.line || '?') + '</div>' +
                            '<div class="issue-actions">' +
                                '<button onclick="openFile(\'' + issue.file + '\', ' + issue.line + ')">Open</button>' +
                                (issue.fix ? '<button onclick="applyFix(' + JSON.stringify(issue).replace(/"/g, '"') + ')">Fix</button>' : '') +
                                '<button onclick="ignoreIssue(' + JSON.stringify(issue).replace(/"/g, '"') + ')">Ignore</button>' +
                            '</div>';
                        content.appendChild(item);
                    }
                    
                    section.appendChild(header);
                    section.appendChild(content);
                    container.appendChild(section);
                }
                
                if (data.summary.total === 0) {
                    container.innerHTML = '<div class="empty-state">✅ No issues found!</div>';
                }
            }
        });

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=sidebarProvider.js.map