const vscode = require('vscode');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Global state
let diagnosticCollection;
let statusBarItem;
let panel;
let currentIssues = [];

/**
 * Get Sentinel configuration
 */
function getConfig() {
    return vscode.workspace.getConfiguration('sentinel');
}

/**
 * Get the Sentinel CLI path
 */
function getSentinelPath() {
    const config = getConfig();
    return config.get('sentinelPath', 'sentinel');
}

/**
 * Show a message in the VSCode output channel
 */
function log(message) {
    const outputChannel = vscode.window.createOutputChannel('Sentinel');
    outputChannel.appendLine(message);
    outputChannel.show();
}

/**
 * Execute a Sentinel command and return the result
 */
function executeSentinelCommand(args, cwd = vscode.workspace.rootPath) {
    return new Promise((resolve, reject) => {
        const sentinelPath = getSentinelPath();
        const cmd = `${sentinelPath} ${args.join(' ')}`;
        
        log(`Executing: ${cmd}`);
        
        exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                // If command not found, try with npx
                if (error.code === 127) {
                    const npxCmd = `npx sentinel ${args.join(' ')}`;
                    exec(npxCmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (err, out, errOut) => {
                        if (err) {
                            reject(new Error(`Sentinel not found. Please install sentinel-cli: npm install -g sentinel-cli\n${err.message}`));
                        } else {
                            resolve(out);
                        }
                    });
                } else {
                    reject(error);
                }
            } else {
                resolve(stdout);
            }
        });
    });
}

/**
 * Parse Sentinel JSON output
 */
function parseSentinelOutput(output) {
    try {
        // Try to find JSON in the output
        const jsonMatch = output.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(output);
    } catch (e) {
        log(`Failed to parse output: ${output.substring(0, 500)}`);
        return [];
    }
}

/**
 * Create diagnostic decorations for issues
 */
function updateDecorations(issues) {
    if (!diagnosticCollection) {
        diagnosticCollection = vscode.languages.createDiagnosticCollection('sentinel');
    }
    
    diagnosticCollection.clear();
    
    // Group issues by file
    const issuesByFile = {};
    for (const issue of issues) {
        if (issue.file) {
            if (!issuesByFile[issue.file]) {
                issuesByFile[issue.file] = [];
            }
            issuesByFile[issue.file].push(issue);
        }
    }
    
    // Create diagnostics for each file
    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
        const uri = vscode.Uri.file(filePath);
        const diagnostics = [];
        
        for (const issue of fileIssues) {
            const range = new vscode.Range(
                (issue.line || 1) - 1,
                0,
                (issue.line || 1) - 1,
                1000
            );
            
            const severity = mapSeverity(issue.severity);
            
            const diagnostic = new vscode.Diagnostic(
                range,
                `${issue.title || issue.message || 'Issue detected'}`,
                severity
            );
            
            if (issue.suggestion || issue.fix) {
                diagnostic.code = issue.suggestion || issue.fix;
            }
            
            diagnostics.push(diagnostic);
        }
        
        diagnosticCollection.set(uri, diagnostics);
    }
}

/**
 * Map Sentinel severity to VSCode severity
 */
function mapSeverity(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'critical':
            return vscode.DiagnosticSeverity.Error;
        case 'high':
            return vscode.DiagnosticSeverity.Error;
        case 'medium':
            return vscode.DiagnosticSeverity.Warning;
        case 'low':
            return vscode.DiagnosticSeverity.Information;
        case 'info':
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}

/**
 * Analyze the current file or selection
 */
async function analyzeFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file to analyze');
        return;
    }
    
    const filePath = editor.document.uri.fsPath;
    const config = getConfig();
    
    if (!config.get('enable', true)) {
        vscode.window.showInformationMessage('Sentinel is disabled. Enable it in settings.');
        return;
    }
    
    vscode.window.showInformationMessage('🔍 Running Sentinel analysis...');
    
    try {
        const analyzers = config.get('analyzers', ['security', 'quality', 'bugs', 'performance']).join(',');
        const output = await executeSentinelCommand([
            'analyze',
            filePath,
            '--analyzers', analyzers,
            '--format', 'json'
        ]);
        
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        // Update decorations
        if (config.get('showInlineDecorations', true)) {
            updateDecorations(issues);
        }
        
        // Show results in panel
        showResults(issues);
        
        // Update status bar
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Analysis complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
    }
}

/**
 * Analyze the entire workspace folder
 */
async function analyzeFolder() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    const config = getConfig();
    
    if (!config.get('enable', true)) {
        vscode.window.showInformationMessage('Sentinel is disabled. Enable it in settings.');
        return;
    }
    
    // Ask user to select analyzers
    const analyzers = await vscode.window.showQuickPick([
        { label: 'security', description: 'Security scanning' },
        { label: 'quality', description: 'Code quality' },
        { label: 'bugs', description: 'Bug detection' },
        { label: 'performance', description: 'Performance issues' },
        { label: 'full', description: 'Full scan (all analyzers)' }
    ], {
        placeHolder: 'Select analysis type',
        canPickMany: false
    });
    
    if (!analyzers) return;
    
    vscode.window.showInformationMessage('🔍 Running Sentinel analysis...');
    
    try {
        let args;
        if (analyzers.label === 'full') {
            args = ['full-scan', '--format', 'json'];
        } else {
            args = ['analyze', '--analyzers', analyzers.label, '--format', 'json'];
        }
        
        const output = await executeSentinelCommand(args);
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        // Update decorations for workspace files
        if (config.get('showInlineDecorations', true)) {
            updateDecorations(issues);
        }
        
        // Show results in panel
        showResults(issues);
        
        // Update status bar
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Analysis complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
    }
}

/**
 * Run security audit
 */
async function securityAudit() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    vscode.window.showInformationMessage('🔒 Running Security Audit...');
    
    try {
        const output = await executeSentinelCommand(['security-audit', '--format', 'json']);
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        updateDecorations(issues);
        showResults(issues);
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Security audit complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Security audit failed: ${error.message}`);
    }
}

/**
 * Run full scan
 */
async function fullScan() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    vscode.window.showInformationMessage('🚀 Running Full Scan...');
    
    try {
        const output = await executeSentinelCommand(['full-scan', '--format', 'json']);
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        updateDecorations(issues);
        showResults(issues);
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Full scan complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Full scan failed: ${error.message}`);
    }
}

/**
 * Run pre-commit check
 */
async function preCommit() {
    vscode.window.showInformationMessage('⚡ Running Pre-commit Check...');
    
    try {
        const output = await executeSentinelCommand(['pre-commit']);
        vscode.window.showInformationMessage(output || '✅ Pre-commit check passed');
    } catch (error) {
        vscode.window.showErrorMessage(`Pre-commit check failed: ${error.message}`);
    }
}

/**
 * Run frontend analysis
 */
async function frontendAnalysis() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    vscode.window.showInformationMessage('🎨 Running Frontend Analysis...');
    
    try {
        const output = await executeSentinelCommand(['frontend', '--format', 'json']);
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        updateDecorations(issues);
        showResults(issues);
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Frontend analysis complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Frontend analysis failed: ${error.message}`);
    }
}

/**
 * Run backend analysis
 */
async function backendAnalysis() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    vscode.window.showInformationMessage('🔧 Running Backend Analysis...');
    
    try {
        const output = await executeSentinelCommand(['backend', '--format', 'json']);
        const issues = parseSentinelOutput(output);
        currentIssues = issues;
        
        updateDecorations(issues);
        showResults(issues);
        updateStatusBar(issues);
        
        vscode.window.showInformationMessage(`✅ Backend analysis complete: ${issues.length} issues found`);
    } catch (error) {
        vscode.window.showErrorMessage(`Backend analysis failed: ${error.message}`);
    }
}

/**
 * Auto-fix issues
 */
async function autoFix() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }
    
    const config = getConfig();
    const fixTypes = config.get('fixTypes', 'all');
    
    vscode.window.showInformationMessage('🔧 Running Auto-fix...');
    
    try {
        const output = await executeSentinelCommand(['fix', '--type', fixTypes]);
        vscode.window.showInformationMessage(`✅ Auto-fix complete: ${output}`);
        
        // Refresh analysis after fixing
        await analyzeFolder();
    } catch (error) {
        vscode.window.showErrorMessage(`Auto-fix failed: ${error.message}`);
    }
}

/**
 * Open AI Chat interface
 */
async function openChat() {
    // Create a new webview panel for chat
    const panel = vscode.window.createWebviewPanel(
        'sentinelChat',
        'Sentinel AI Chat',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
    
    panel.webview.html = getChatHtml();
    
    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === 'chat') {
            try {
                const output = await executeSentinelCommand([
                    'chat',
                    '--prompt', message.text
                ]);
                
                panel.webview.postMessage({ type: 'response', text: output });
            } catch (error) {
                panel.webview.postMessage({ type: 'error', text: error.message });
            }
        }
    });
}

/**
 * Show configuration
 */
async function showConfig() {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'sentinel');
}

/**
 * Show status
 */
async function showStatus() {
    try {
        const output = await executeSentinelCommand(['status']);
        vscode.window.showInformationMessage(output || 'Sentinel is running');
    } catch (error) {
        vscode.window.showInformationMessage('Sentinel is not configured. Run sentinel auth to set up.');
    }
}

/**
 * Show results in output channel
 */
function showResults(issues) {
    const outputChannel = vscode.window.createOutputChannel('Sentinel Results');
    
    if (!issues || issues.length === 0) {
        outputChannel.appendLine('✅ No issues found!');
        outputChannel.show();
        return;
    }
    
    // Group by severity
    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');
    const medium = issues.filter(i => i.severity === 'medium');
    const low = issues.filter(i => i.severity === 'low');
    const info = issues.filter(i => i.severity === 'info');
    
    outputChannel.appendLine('═══════════════════════════════════════');
    outputChannel.appendLine('🛡️  SENTINEL ANALYSIS RESULTS');
    outputChannel.appendLine('═══════════════════════════════════════\n');
    
    if (critical.length > 0) {
        outputChannel.appendLine(`🛑 CRITICAL: ${critical.length}`);
        for (const issue of critical.slice(0, 5)) {
            outputChannel.appendLine(`   ${issue.file}:${issue.line} - ${issue.title || issue.message}`);
        }
    }
    
    if (high.length > 0) {
        outputChannel.appendLine(`🔶 HIGH: ${high.length}`);
        for (const issue of high.slice(0, 5)) {
            outputChannel.appendLine(`   ${issue.file}:${issue.line} - ${issue.title || issue.message}`);
        }
    }
    
    if (medium.length > 0) {
        outputChannel.appendLine(`⚠️  MEDIUM: ${medium.length}`);
    }
    
    if (low.length > 0) {
        outputChannel.appendLine(`🔷 LOW: ${low.length}`);
    }
    
    if (info.length > 0) {
        outputChannel.appendLine(`ℹ️  INFO: ${info.length}`);
    }
    
    outputChannel.appendLine(`\n📊 Total: ${issues.length} issues`);
    outputChannel.appendLine('═══════════════════════════════════════');
    outputChannel.show();
}

/**
 * Update status bar with issue count
 */
function updateStatusBar(issues) {
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        statusBarItem.command = 'sentinel.analyze';
        statusBarItem.tooltip = 'Click to run Sentinel analysis';
    }
    
    if (!issues || issues.length === 0) {
        statusBarItem.text = '🛡️ Sentinel: ✅ Clean';
        statusBarItem.color = '#4CAF50';
    } else {
        const critical = issues.filter(i => i.severity === 'critical').length;
        const high = issues.filter(i => i.severity === 'high').length;
        
        if (critical > 0) {
            statusBarItem.text = `🛡️ Sentinel: ${critical} critical, ${high} high`;
            statusBarItem.color = '#f44336';
        } else if (high > 0) {
            statusBarItem.text = `🛡️ Sentinel: ${high} high, ${issues.length} total`;
            statusBarItem.color = '#ff9800';
        } else {
            statusBarItem.text = `🛡️ Sentinel: ${issues.length} issues`;
            statusBarItem.color = '#ffc107';
        }
    }
    
    statusBarItem.show();
}

/**
 * Get HTML for chat panel
 */
function getChatHtml() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sentinel AI Chat</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            margin: 0;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #3c3c3c;
        }
        .header h1 {
            margin: 0;
            font-size: 18px;
            color: #00d4ff;
        }
        .chat-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
            height: calc(100vh - 100px);
            overflow-y: auto;
        }
        .message {
            padding: 10px 15px;
            border-radius: 8px;
            max-width: 80%;
        }
        .user-message {
            background: #264f78;
            align-self: flex-end;
        }
        .assistant-message {
            background: #2d2d2d;
            align-self: flex-start;
        }
        .error-message {
            background: #5a1d1d;
            color: #f48771;
        }
        .input-container {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        input {
            flex: 1;
            padding: 10px;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            background: #2d2d2d;
            color: #d4d4d4;
            font-size: 14px;
        }
        input:focus {
            outline: none;
            border-color: #00d4ff;
        }
        button {
            padding: 10px 20px;
            background: #00d4ff;
            color: #000;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover {
            background: #00a3cc;
        }
        button:disabled {
            background: #555;
            cursor: not-allowed;
        }
        .loading {
            color: #888;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ Sentinel AI Assistant</h1>
    </div>
    <div class="chat-container" id="chat">
        <div class="message assistant-message">
            Hello! I'm your Sentinel AI assistant. Ask me anything about your code, security, or best practices.
        </div>
    </div>
    <div class="input-container">
        <input type="text" id="input" placeholder="Ask a question about your code..." autofocus>
        <button id="send">Send</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('send');
        const chat = document.getElementById('chat');
        
        function addMessage(text, isUser = false, isError = false) {
            const div = document.createElement('div');
            div.className = 'message ' + (isError ? 'error-message' : isUser ? 'user-message' : 'assistant-message');
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
        
        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            
            addMessage(text, true);
            input.value = '';
            
            sendBtn.disabled = true;
            addMessage('Thinking...', false);
            const loadingMsg = chat.lastElementChild;
            
            vscode.postMessage({ type: 'chat', text });
        }
        
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        
        window.addEventListener('message', (event) => {
            const msg = event.data;
            
            // Remove loading message
            if (loadingMsg && loadingMsg.textContent === 'Thinking...') {
                loadingMsg.remove();
            }
            
            if (msg.type === 'response') {
                addMessage(msg.text);
            } else if (msg.type === 'error') {
                addMessage('Error: ' + msg.text, false, true);
            }
            
            sendBtn.disabled = false;
        });
    </script>
</body>
</html>`;
}

/**
 * Activate the extension
 */
function activate(context) {
    log('🛡️ Sentinel VSCode Extension activated');
    
    // Register commands
    const commands = [
        { command: 'sentinel.analyze', handler: analyzeFile },
        { command: 'sentinel.analyzeFolder', handler: analyzeFolder },
        { command: 'sentinel.securityAudit', handler: securityAudit },
        { command: 'sentinel.fullScan', handler: fullScan },
        { command: 'sentinel.preCommit', handler: preCommit },
        { command: 'sentinel.frontend', handler: frontendAnalysis },
        { command: 'sentinel.backend', handler: backendAnalysis },
        { command: 'sentinel.fix', handler: autoFix },
        { command: 'sentinel.chat', handler: openChat },
        { command: 'sentinel.config', handler: showConfig },
        { command: 'sentinel.status', handler: showStatus },
        { command: 'sentinel.refresh', handler: analyzeFolder }
    ];
    
    for (const { command, handler } of commands) {
        const disposable = vscode.commands.registerCommand(command, handler);
        context.subscriptions.push(disposable);
    }
    
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '🛡️ Sentinel';
    statusBarItem.command = 'sentinel.analyze';
    statusBarItem.tooltip = 'Click to run Sentinel analysis';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    
    // Listen for file saves
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            const config = getConfig();
            if (config.get('autoScan', false)) {
                analyzeFile();
            }
        })
    );
    
    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('sentinel')) {
                log('Sentinel configuration changed');
            }
        })
    );
    
    // Show welcome message
    vscode.window.showInformationMessage(
        '🛡️ Sentinel VSCode Extension activated! Run "Sentinel: Analyze" to start.'
    );
}

/**
 * Deactivate the extension
 */
function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (panel) {
        panel.dispose();
    }
    log('Sentinel VSCode Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
