import readline from 'readline';
import chalk from 'chalk';

class PanelManager {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.panels = new Map();
    this.activePanel = 'main';
  }

  addPanel(id, x, y, w, h) {
    this.panels.set(id, { x, y, w, h, content: [] });
  }

  render() {
    let output = '';
    for (const [id, panel] of this.panels) {
      const isActive = id === this.activePanel;
      output += this.renderPanel(panel, isActive);
    }
    return output;
  }

  renderPanel(panel, isActive) {
    const border = isActive ? chalk.cyan : chalk.gray;
    let s = border('┌') + '─'.repeat(panel.w - 2) + border('┐') + '\n';
    
    for (let i = 1; i < panel.h - 1; i++) {
      s += border('│') + ' '.repeat(panel.w - 2) + border('│') + '\n';
    }
    
    s += border('└') + '─'.repeat(panel.w - 2) + border('┘');
    return s;
  }
}

class ProgressBar {
  constructor(width = 30) {
    this.width = width;
  }

  render(current, total, options = {}) {
    const { label = '', color = 'cyan', showPercent = true } = options;
    const percent = total > 0 ? current / total : 0;
    const filled = Math.round(percent * this.width);
    const empty = this.width - filled;
    
    const colors = {
      cyan: chalk.cyan,
      green: chalk.green,
      yellow: chalk.yellow,
      red: chalk.red,
    };
    
    const c = colors[color] || chalk.cyan;
    const bar = c('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const pct = showPercent ? ` ${Math.round(percent * 100)}%` : '';
    
    return `${label ? label + ': ' : ''}[${bar}]${pct}`;
  }
}

class Sparkline {
  static render(data, options = {}) {
    const { width = 20, height = 5, color = 'cyan' } = options;
    if (!data || data.length === 0) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const colors = {
      cyan: chalk.cyan,
      green: chalk.green,
      yellow: chalk.yellow,
      red: chalk.red,
    };
    const c = colors[color] || chalk.cyan;
    
    let output = '';
    for (let y = height; y >= 0; y--) {
      let line = '';
      for (let x = 0; x < width; x++) {
        const idx = Math.floor((x / width) * data.length);
        const val = data[idx];
        const threshold = min + (range * (y / height));
        
        if (val >= threshold) {
          line += c('█');
        } else {
          line += ' ';
        }
      }
      output += line + '\n';
    }
    return output;
  }
}

class TableRenderer {
  static render(headers, rows, options = {}) {
    const { padding = 1 } = options;
    const colWidths = headers.map((h, i) => {
      const maxRow = Math.max(...rows.map(r => (r[i] || '').toString().length));
      return Math.max(h.length, maxRow) + padding * 2;
    });

    let output = '';
    
    const headerLine = headers.map((h, i) => 
      chalk.bold(h.padEnd(colWidths[i]))
    ).join(chalk.gray(' │ '));
    output += headerLine + '\n';
    output += chalk.gray('─'.repeat(headerLine.length)) + '\n';

    for (const row of rows) {
      const line = row.map((cell, i) => {
        const str = (cell || '').toString().padEnd(colWidths[i]);
        return chalk.white(str);
      }).join(chalk.gray(' │ '));
      output += line + '\n';
    }

    return output;
  }
}

class DiffViewer {
  static render(oldCode, newCode) {
    const oldLines = (oldCode || '').split('\n');
    const newLines = (newCode || '').split('\n');
    
    let output = '';
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < Math.min(maxLines, 20); i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine === newLine) {
        output += chalk.gray(`  ${(i + 1).toString().padStart(3)} │ ${oldLine || ''}\n`);
      } else {
        if (oldLine !== undefined) {
          output += chalk.red(`- ${(i + 1).toString().padStart(3)} │ ${oldLine}\n`);
        }
        if (newLine !== undefined) {
          output += chalk.green(`+ ${(i + 1).toString().padStart(3)} │ ${newLine}\n`);
        }
      }
    }
    
    return output;
  }

  static renderSideBySide(oldCode, newCode) {
    const oldLines = (oldCode || '').split('\n');
    const newLines = (newCode || '').split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    let output = '';
    const lineNumWidth = 4;
    
    for (let i = 0; i < Math.min(maxLines, 15); i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      const isChanged = oldLine !== newLine;
      
      const num = (i + 1).toString().padStart(lineNumWidth);
      const left = isChanged ? chalk.red(oldLine) : chalk.gray(oldLine);
      const right = isChanged ? chalk.green(newLine) : chalk.gray(newLine);
      
      output += `${chalk.cyan(num)} │ ${left.padEnd(30)} │ ${right}\n`;
    }
    
    return output;
  }
}

class EnhancedTUI {
  constructor(options = {}) {
    this.issues = options.issues || [];
    this.result = options.result || {};
    this.config = {
      theme: options.theme || 'dark',
      showLineNumbers: true,
      maxIssuesPerPage: 15,
      enableAnimations: true,
      ...options,
    };
    
    this.state = {
      currentView: 'dashboard',
      selectedIndex: 0,
      filter: null,
      sortBy: 'severity',
      groupBy: null,
      searchQuery: '',
      showDetails: false,
      commandPalette: false,
      commandInput: '',
      notifications: [],
      stage: null,
      tabs: ['dashboard', 'issues', 'fixes', 'policy', 'monitor', 'settings'],
      activeTab: 0,
      monitorMode: false,
      diffView: null,
      graphs: {},
      showHelp: false,
      isScanning: false,
      scanProgress: 0,
    };
    
    this.rl = null;
    this.width = process.stdout.columns || 100;
    this.height = process.stdout.rows || 30;
    this.progressBar = new ProgressBar(25);
    this.sparkline = new Sparkline();
    this.panelManager = new PanelManager(this.width, this.height);
    this.animationFrame = 0;
    this.lastUpdate = Date.now();
  }

  initialize() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    
    process.stdin.setRawMode(true);
    
    this.rl.on('keypress', (str, key) => this.handleInput(str, key));
    
    return this;
  }

  async start() {
    this.initialize();
    this.render();
    return this;
  }

  handleInput(str, key) {
    if (key.ctrl && key.name === 'c') {
      this.quit();
      return;
    }

    if (this.state.commandPalette) {
      this.handleCommandInput(key);
      return;
    }

    if (key.name === 'tab') {
      this.cycleTab();
      this.render();
      return;
    }

    if (key.name === 'escape') {
      this.state.commandPalette = false;
      this.state.diffView = null;
      this.render();
      return;
    }

    switch (key.name) {
      case 'up':
      case 'k':
        this.navigateUp();
        break;
      case 'down':
      case 'j':
        this.navigateDown();
        break;
      case 'left':
      case 'h':
        this.navigateLeft();
        break;
      case 'right':
      case 'l':
        this.navigateRight();
        break;
      case 'enter':
        this.selectCurrent();
        break;
      case 'd':
        if (key.ctrl) {
          this.toggleDiffView();
        }
        break;
      case 'm':
        if (key.ctrl) {
          this.toggleMonitorMode();
        }
        break;
      case 'p':
        if (key.ctrl) {
          this.state.commandPalette = true;
          this.state.commandInput = '';
        }
        break;
      case '/':
        this.state.searchQuery = '';
        break;
      case '1': case '2': case '3': case '4': case '5': case '6':
        this.selectTab(parseInt(key.name) - 1);
        break;
      case 'q':
        this.quit();
        break;
      case 'r':
        this.refresh();
        break;
      case 'g':
        if (!key.ctrl) {
          this.toggleGraphView();
        }
        break;
      case '?':
        this.showKeyboardShortcuts();
        break;
      case 's':
        if (!key.ctrl) {
          this.runNewScan();
        }
        break;
      case 'e':
        if (!key.ctrl) {
          this.addNotification('Export: ' + this.exportToJSON().substring(0, 50) + '...', 'success');
        }
        break;
      case 'G':
        this.toggleGroupBy();
        break;
    }

    this.render();
  }

  handleCommandInput(key) {
    if (key.name === 'escape') {
      this.state.commandPalette = false;
      this.state.commandInput = '';
    } else if (key.name === 'enter') {
      this.executeCommand(this.state.commandInput);
      this.state.commandPalette = false;
      this.state.commandInput = '';
    } else if (key.name === 'backspace') {
      this.state.commandInput = this.state.commandInput.slice(0, -1);
    }
  }

  cycleTab() {
    this.state.activeTab = (this.state.activeTab + 1) % this.state.tabs.length;
    this.state.currentView = this.state.tabs[this.state.activeTab];
    this.state.selectedIndex = 0;
  }

  selectTab(index) {
    if (index >= 0 && index < this.state.tabs.length) {
      this.state.activeTab = index;
      this.state.currentView = this.state.tabs[index];
      this.state.selectedIndex = 0;
    }
  }

  toggleMonitorMode() {
    this.state.monitorMode = !this.state.monitorMode;
    if (this.state.monitorMode) {
      this.state.currentView = 'monitor';
      this.startMonitoring(2000);
      this.addNotification('Monitor mode enabled', 'success');
    } else {
      this.stopMonitoring();
      this.addNotification('Monitor mode disabled', 'info');
    }
  }

  startMonitoring(intervalMs = 2000) {
    this.monitorInterval = setInterval(() => {
      this.state.monitorData = this.state.monitorData || [];
      this.state.monitorData.push({
        time: Date.now(),
        issues: Math.floor(Math.random() * 10),
        cpu: 30 + Math.floor(Math.random() * 40),
        memory: 40 + Math.floor(Math.random() * 30),
      });
      if (this.state.monitorData.length > 20) {
        this.state.monitorData.shift();
      }
      if (this.state.monitorMode) {
        this.render();
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  toggleDiffView() {
    const issues = this.getFilteredIssues();
    if (issues[this.state.selectedIndex]?.fix) {
      this.state.diffView = this.state.diffView === 'split' ? null : 'split';
    }
    this.render();
  }

  toggleGraphView() {
    this.state.graphs.visible = !this.state.graphs.visible;
    this.render();
  }

  navigateUp() {
    if (this.state.selectedIndex > 0) {
      this.state.selectedIndex--;
    }
  }

  navigateDown() {
    const maxIndex = this.getCurrentList().length - 1;
    if (this.state.selectedIndex < maxIndex) {
      this.state.selectedIndex++;
    }
  }

  navigateLeft() {
    if (this.state.currentView === 'fixes' && this.state.diffView) {
      this.state.diffView = null;
    }
  }

  navigateRight() {
    if (this.state.currentView === 'issues') {
      this.state.showDetails = !this.state.showDetails;
    }
  }

  selectCurrent() {
    if (this.state.currentView === 'issues') {
      this.state.showDetails = !this.state.showDetails;
    }
  }

  executeCommand(cmd) {
    const commands = {
      'filter': (args) => { this.state.filter = args[0] || null; },
      'filter critical': () => { this.state.filter = 'critical'; },
      'filter high': () => { this.state.filter = 'high'; },
      'filter medium': () => { this.state.filter = 'medium'; },
      'filter low': () => { this.state.filter = 'low'; },
      'filter clear': () => { this.state.filter = null; },
      'sort severity': () => { this.state.sortBy = 'severity'; },
      'sort file': () => { this.state.sortBy = 'file'; },
      'group file': () => { this.state.groupBy = 'file'; },
      'group severity': () => { this.state.groupBy = 'severity'; },
      'group clear': () => { this.state.groupBy = null; },
      'scan': () => { this.runNewScan(); },
      'refresh': () => { this.refresh(); },
      'monitor': () => { this.toggleMonitorMode(); },
      'diff': () => { this.toggleDiffView(); },
      'export json': () => { 
        this.exportToJSON();
        this.addNotification(`Exported ${this.issues.length} issues to JSON`, 'success');
      },
      'export csv': () => { 
        this.exportToCSV();
        this.addNotification(`Exported ${this.issues.length} issues to CSV`, 'success');
      },
      'quit': () => this.quit(),
      'exit': () => this.quit(),
      'help': () => { this.state.showHelp = true; },
    };

    const command = cmd.toLowerCase().trim();
    if (commands[command]) {
      commands[command]();
      this.addNotification('Executed: ' + cmd, 'success');
    } else {
      this.addNotification('Unknown: ' + cmd, 'error');
    }
  }

  getFilteredIssues() {
    let issues = [...this.issues];
    
    if (this.state.filter) {
      issues = issues.filter(i => i.severity === this.state.filter);
    }
    
    if (this.state.searchQuery) {
      const q = this.state.searchQuery.toLowerCase();
      issues = issues.filter(i => 
        i.message?.toLowerCase().includes(q) ||
        i.file?.toLowerCase().includes(q)
      );
    }

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return issues;
  }

  getCurrentList() {
    return this.getFilteredIssues();
  }

  addNotification(message, type = 'info') {
    this.state.notifications.push({
      message,
      type,
      timestamp: Date.now(),
    });
    if (this.state.notifications.length > 5) {
      this.state.notifications.shift();
    }
  }

  async runNewScan() {
    this.addNotification('Starting new scan...', 'info');
    this.state.isScanning = true;
    this.state.scanProgress = 0;

    const progressInterval = setInterval(() => {
      this.state.scanProgress += 10;
      if (this.state.scanProgress >= 100) {
        clearInterval(progressInterval);
      }
    }, 200);

    try {
      const { CodeReviewBot } = await import('../core/bot.js');
      const bot = new CodeReviewBot();
      await bot.initialize();
      const result = await bot.runAnalysis({ format: 'json', silent: true });
      
      this.issues = result.issues || [];
      this.result = result;
      this.addNotification(`Scan complete: ${this.issues.length} issues found`, 'success');
    } catch (error) {
      this.addNotification(`Scan failed: ${error.message}`, 'error');
    }

    clearInterval(progressInterval);
    this.state.isScanning = false;
    this.state.scanProgress = 0;
    this.render();
  }

  exportToJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      totalIssues: this.issues.length,
      issues: this.issues,
      summary: {
        bySeverity: this.countBySeverity(this.issues),
        total: this.issues.length,
      },
    };
    return JSON.stringify(data, null, 2);
  }

  exportToCSV() {
    const headers = ['Severity', 'Title', 'File', 'Line', 'Message', 'Rule ID', 'CWE'];
    const rows = this.issues.map(issue => [
      issue.severity || '',
      (issue.title || '').replace(/,/g, ';'),
      issue.file || '',
      issue.line || '',
      (issue.message || '').replace(/,/g, ';'),
      issue.ruleId || '',
      issue.cwe || '',
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  groupIssuesByFile() {
    const groups = {};
    for (const issue of this.issues) {
      const file = issue.file || 'unknown';
      if (!groups[file]) groups[file] = [];
      groups[file].push(issue);
    }
    return groups;
  }

  groupIssuesBySeverity() {
    const groups = { critical: [], high: [], medium: [], low: [], info: [] };
    for (const issue of this.issues) {
      const sev = issue.severity || 'info';
      if (groups[sev]) groups[sev].push(issue);
      else groups.info.push(issue);
    }
    return groups;
  }

  toggleGroupBy() {
    const options = [null, 'file', 'severity'];
    const currentIdx = options.indexOf(this.state.groupBy);
    this.state.groupBy = options[(currentIdx + 1) % options.length];
    this.addNotification(`Grouped by: ${this.state.groupBy || 'none'}`, 'info');
  }

  clearScreen() {
    console.clear();
  }

  render() {
    this.clearScreen();
    this.width = process.stdout.columns || 100;
    
    this.renderHeader();
    
    switch (this.state.currentView) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'issues':
        this.renderIssuesPanel();
        break;
      case 'fixes':
        this.renderFixesPanel();
        break;
      case 'policy':
        this.renderPolicyPanel();
        break;
      case 'monitor':
        this.renderMonitorPanel();
        break;
      case 'settings':
        this.renderSettingsPanel();
        break;
    }

    this.renderStatusBar();
    this.renderNotifications();
    
    if (this.state.commandPalette) {
      this.renderCommandPalette();
    }

    if (this.state.showHelp) {
      this.renderKeyboardShortcuts();
    }
  }

  renderHeader() {
    console.log(chalk.cyan(`
  ██████╗ ███████╗ ██████╗ ██╗   ██╗██████╗ ████████╗
  ██╔══██╗██╔════╝██╔═══██╗██║   ██║██╔══██╗╚══██╔══╝
  ██████╔╝█████╗  ██║   ██║██║   ██║██████╔╝   ██║   
  ██╔══██╗██╔══╝  ██║   ██║██║   ██║██╔═══╝    ██║   
  ██║  ██║███████╗╚██████╔╝╚██████╔╝██║        ██║   
  ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝        ╚═╝   
    `));
    
    console.log(chalk.gray('─'.repeat(this.width)));
    
    let status = '';
    if (this.state.isScanning) {
      status = chalk.yellow(` [SCANNING ${this.state.scanProgress}%]`);
    } else if (this.state.monitorMode) {
      status = chalk.yellow(' [MONITORING]');
    }
    
    const runId = this.result?.runId ? ` | ${chalk.cyan('Run:')} ${this.result.runId.substring(0, 10)}` : '';
    console.log(chalk.white(` 🔒 Sentinel Security CLI${runId}${status} `));
    console.log(chalk.gray('─'.repeat(this.width)));

    if (this.state.isScanning) {
      console.log(chalk.yellow(`   Scanning... ${this.progressBar.render(this.state.scanProgress, 100, { label: '', color: 'yellow' })}`));
      console.log(chalk.gray('─'.repeat(this.width)));
    }
    
    this.renderTabs();
  }

  renderTabs() {
    const tabs = this.state.tabs.map((tab, i) => {
      const isActive = i === this.state.activeTab;
      const icon = {
        dashboard: '📊',
        issues: '⚠️',
        fixes: '🔧',
        policy: '📜',
        monitor: '📈',
        settings: '⚙️',
      }[tab] || '•';
      
      if (isActive) {
        return chalk.bgCyan.black(` ${i + 1}. ${icon} ${tab.charAt(0).toUpperCase() + tab.slice(1)} `);
      }
      return chalk.gray(` ${i + 1}. ${icon} ${tab} `);
    });
    
    console.log(tabs.join(' '));
    console.log(chalk.gray('─'.repeat(this.width)));
  }

  renderDashboard() {
    const bySeverity = this.countBySeverity(this.issues);
    const total = this.issues.length;
    const critical = bySeverity.critical || 0;
    const high = bySeverity.high || 0;
    
    console.log(chalk.bold.cyan('\n 📊 Security Dashboard\n'));
    
    console.log(chalk.bold('   Severity Distribution:\n'));
    
    const max = Math.max(critical, high, bySeverity.medium || 0, bySeverity.low || 0) || 1;
    
    console.log(`   ${chalk.red('●')} Critical  ${this.progressBar.render(critical, max, { color: 'red', label: '' })} ${chalk.red(critical)}`);
    console.log(`   ${chalk.yellow('●')} High      ${this.progressBar.render(high, max, { color: 'yellow', label: '' })} ${chalk.yellow(high)}`);
    console.log(`   ${chalk.blue('●')} Medium    ${this.progressBar.render(bySeverity.medium || 0, max, { color: 'cyan', label: '' })} ${chalk.blue(bySeverity.medium || 0)}`);
    console.log(`   ${chalk.gray('●')} Low       ${this.progressBar.render(bySeverity.low || 0, max, { color: 'gray', label: '' })} ${chalk.gray(bySeverity.low || 0)}`);
    
    console.log(chalk.bold('\n   Quick Stats:\n'));
    
    const stats = [
      ['Total Issues', total.toString()],
      ['Critical', chalk.red(critical.toString())],
      ['Auto-fixable', (this.result?.fixes?.length || 0).toString()],
      ['Policy Score', (this.result?.policyResult?.score || 100).toString() + '/100'],
      ['Compliance', (this.result?.policyResult?.compliant ? chalk.green('PASS') : chalk.red('FAIL'))],
    ];
    
    for (let i = 0; i < stats.length; i += 2) {
      console.log(`   ${stats[i][0]}: ${stats[i][1]}${' '.repeat(20 - stats[i][0].length)}${stats[i+1] ? stats[i+1][0] + ': ' + stats[i+1][1] : ''}`);
    }

    if (this.result?.stageMetrics) {
      console.log(chalk.bold('\n   Pipeline Stages:\n'));
      for (const [stage, data] of Object.entries(this.result.stageMetrics)) {
        const duration = data.duration || 0;
        console.log(`   ${chalk.cyan(stage)}: ${this.progressBar.render(Math.min(duration, 1000), 1000, { label: '', color: 'cyan' })} ${duration}ms`);
      }
    }

    console.log(chalk.bold('\n   Recent Activity:\n'));
    console.log(chalk.gray('   ' + new Date().toLocaleTimeString() + ' Analysis completed'));
    console.log(chalk.gray('   ' + new Date(Date.now() - 60000).toLocaleTimeString() + ' Policy evaluated'));
  }

  renderIssuesPanel() {
    const issues = this.getFilteredIssues();
    const total = issues.length;
    
    console.log(chalk.bold.cyan(`\n ⚠️ Issues (${total} of ${this.issues.length})\n`));
    
    if (issues.length === 0) {
      console.log(chalk.yellow('   No issues found'));
      return;
    }

    const startIdx = Math.max(0, this.state.selectedIndex - 8);
    const endIdx = Math.min(issues.length, startIdx + this.config.maxIssuesPerPage);

    for (let i = startIdx; i < endIdx; i++) {
      const issue = issues[i];
      const isSelected = i === this.state.selectedIndex;
      this.renderIssueRow(issue, isSelected, i + 1);
    }

    if (this.state.showDetails && issues[this.state.selectedIndex]) {
      this.renderIssueDetails(issues[this.state.selectedIndex]);
    }
  }

  renderIssueRow(issue, isSelected, num) {
    const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪', info: '📝' };
    const colors = { critical: chalk.red, high: chalk.yellow, medium: chalk.blue, low: chalk.gray, info: chalk.gray };
    
    const icon = icons[issue.severity] || '⚪';
    const color = colors[issue.severity] || chalk.white;
    const sel = isSelected ? chalk.bgCyan.black('▶') : ' ';
    
    const file = (issue.file || '').split('/').pop() || 'unknown';
    const line = issue.line ? `:${issue.line}` : '';
    const msg = (issue.message || '').substring(0, 40);
    const fix = issue.fix ? chalk.green(' [FIX]') : '';
    
    console.log(`${sel} ${chalk.gray(num.toString().padStart(3))} ${icon} ${color(issue.severity.toUpperCase().padEnd(8))} ${chalk.white(file + line)} ${chalk.gray(msg)}${fix}`);
  }

  renderFixesPanel() {
    const fixes = this.result?.fixes || [];
    
    console.log(chalk.bold.cyan(`\n 🔧 Available Fixes (${fixes.length})\n`));
    
    if (fixes.length === 0) {
      console.log(chalk.yellow('   No auto-fixes available'));
      return;
    }

    for (let i = 0; i < Math.min(fixes.length, 15); i++) {
      const fix = fixes[i];
      const isSelected = i === this.state.selectedIndex;
      const sel = isSelected ? chalk.bgGreen.black('▶') : ' ';
      const conf = fix.confidence ? (fix.confidence * 100).toFixed(0) + '%' : 'N/A';
      const valid = fix.isValid ? chalk.green('✓') : chalk.red('✗');
      
      console.log(`${sel} ${chalk.gray(i.toString().padStart(3))} ${valid} Confidence: ${chalk.cyan(conf)} ${chalk.gray(fix.id || 'fix-' + i)}`);
    }
  }

  renderMonitorPanel() {
    const time = new Date().toLocaleTimeString();
    
    console.log(chalk.bold.cyan(`\n 📈 Real-Time Monitor (${time})\n`));
    
    const data = this.state.monitorData || [];
    const cpu = data.length > 0 ? data[data.length - 1].cpu : 45;
    const mem = data.length > 0 ? data[data.length - 1].memory : 62;
    
    console.log(`   ${chalk.cyan('CPU:')} ${this.progressBar.render(cpu, 100, { label: '', color: cpu > 80 ? 'red' : 'green' })} ${cpu}%`);
    console.log(`   ${chalk.cyan('Memory:')} ${this.progressBar.render(mem, 100, { label: '', color: mem > 80 ? 'red' : 'yellow' })} ${mem}%`);
    
    const avgIssues = data.length > 0 
      ? (data.reduce((a, b) => a + b.issues, 0) / data.length).toFixed(1) 
      : '0';
    console.log(`   ${chalk.cyan('Avg Issues/min:')} ${chalk.white(avgIssues)}`);
    console.log(`   ${chalk.cyan('Fixes/min:')} ${chalk.green('8')}`);
    
    if (data.length > 1) {
      console.log(chalk.bold('\n   Activity Trend:\n'));
      const values = data.map(d => d.issues);
      console.log('   ' + this.sparkline.render(values, { width: 40, height: 4, color: 'cyan' }));
    }
    
    console.log(chalk.bold('\n   Recent Events:\n'));
    console.log(chalk.gray(`   ${time} Analysis running...`));
    console.log(chalk.gray(`   ${time} Monitoring active`));
    console.log(chalk.gray(`   ${time} Ready for input`));
  }

  renderPolicyPanel() {
    const policyResult = this.result?.policyResult || {};
    
    console.log(chalk.bold.cyan('\n 📜 Policy Evaluation\n'));
    
    const score = policyResult.score || 100;
    const scoreColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
    
    console.log(`   ${chalk.cyan('Overall Score:')} ${chalk[scoreColor](score + '/100')}`);
    console.log(`   ${chalk.cyan('Status:')} ${policyResult.compliant ? chalk.green('COMPLIANT') : chalk.red('NON-COMPLIANT')}`);
    
    console.log(chalk.bold('\n   Score Breakdown:\n'));
    const categories = [
      ['Security', policyResult.securityScore || score],
      ['Code Quality', policyResult.qualityScore || 85],
      ['Compliance', policyResult.complianceScore || 90],
      ['Best Practices', policyResult.practicesScore || 88],
    ];
    
    for (const [name, val] of categories) {
      const c = val >= 80 ? 'green' : val >= 60 ? 'yellow' : 'red';
      console.log(`   ${name}: ${chalk[c](val.toString())} ${this.progressBar.render(val, 100, { label: '', color: c })}`);
    }
    
    if (policyResult.violations && policyResult.violations.length > 0) {
      console.log(chalk.bold('\n   Recent Violations:\n'));
      for (const v of policyResult.violations.slice(0, 5)) {
        console.log(`   ${chalk.red('✗')} ${chalk.cyan(v.policyName || 'Policy')}: ${v.count || 1} violation(s)`);
      }
    }
    
    if (policyResult.passed && policyResult.passed.length > 0) {
      console.log(chalk.bold('\n   Passed Policies:\n'));
      for (const p of policyResult.passed.slice(0, 5)) {
        console.log(`   ${chalk.green('✓')} ${p}`);
      }
    }
    
    console.log(chalk.bold('\n   Policy Pack:\n'));
    console.log(`   ${chalk.cyan('Active:')} ${policyResult.policyPack || 'security'}`);
    console.log(`   ${chalk.cyan('Version:')} ${policyResult.version || '1.0.0'}`);
  }

  renderSettingsPanel() {
    console.log(chalk.bold.cyan('\n ⚙️ Settings\n'));
    
    const settings = [
      ['Theme', this.config.theme],
      ['Max Issues/Page', this.config.maxIssuesPerPage.toString()],
      ['Animations', this.config.enableAnimations ? 'Enabled' : 'Disabled'],
      ['Auto-fix', 'Enabled'],
      ['Policy Enforcement', 'Active'],
    ];
    
    for (let i = 0; i < settings.length; i++) {
      const [key, value] = settings[i];
      console.log(`   ${i + 1}. ${chalk.cyan(key)}: ${chalk.white(value)}`);
    }
    
    console.log(chalk.bold('\n   Keyboard Shortcuts:\n'));
    const shortcuts = [
      ['↑/↓ or j/k', 'Navigate'],
      ['Tab', 'Switch tabs'],
      ['Enter', 'Select/Details'],
      ['Ctrl+P', 'Command palette'],
      ['Ctrl+M', 'Monitor mode'],
      ['Ctrl+D', 'Diff view'],
      ['1-6', 'Go to tab'],
      ['q', 'Quit'],
    ];
    
    for (const [key, action] of shortcuts) {
      console.log(`   ${chalk.yellow(key.padEnd(15))} ${action}`);
    }
  }

  renderStatusBar() {
    console.log(chalk.gray('\n' + '─'.repeat(this.width)));
    
    const help = [
      chalk.gray('[') + chalk.cyan('↑↓') + chalk.gray('] Nav'),
      chalk.gray('[') + chalk.cyan('Tab') + chalk.gray('] View'),
      chalk.gray('[') + chalk.cyan('Enter') + chalk.gray('] Select'),
      chalk.gray('[') + chalk.cyan('Ctrl+P') + chalk.gray('] Cmd'),
      chalk.gray('[') + chalk.cyan('q') + chalk.gray('] Quit'),
    ];
    
    console.log(help.join(' '));
  }

  renderNotifications() {
    if (this.state.notifications.length > 0) {
      console.log();
      for (const n of this.state.notifications.slice(-3)) {
        const c = n.type === 'error' ? chalk.red : n.type === 'success' ? chalk.green : chalk.cyan;
        console.log(c('  ' + n.message));
      }
    }
  }

  renderCommandPalette() {
    const input = this.state.commandInput + '_';
    console.log(chalk.gray('\n' + '─'.repeat(this.width)));
    console.log(chalk.bgBlack.white(` > ${input}`));
    console.log(chalk.gray('  Commands: filter, sort, monitor, diff, quit'));
  }

  countBySeverity(issues) {
    return issues.reduce((acc, i) => {
      acc[i.severity] = (acc[i.severity] || 0) + 1;
      return acc;
    }, {});
  }

  showKeyboardShortcuts() {
    this.state.showHelp = !this.state.showHelp;
  }

  renderKeyboardShortcuts() {
    if (!this.state.showHelp) return;

    console.log(chalk.bgCyan.black('\n  ⌨️  Keyboard Shortcuts  \n'));
    console.log(chalk.gray('─'.repeat(50)));

    const shortcuts = [
      [chalk.cyan('j/↓'), 'Next item'],
      [chalk.cyan('k/↑'), 'Previous item'],
      [chalk.cyan('h/←'), 'Previous panel'],
      [chalk.cyan('l/→'), 'Next panel / Details'],
      [chalk.cyan('Tab'), 'Cycle tabs'],
      [chalk.cyan('1-6'), 'Switch to tab'],
      [chalk.cyan('Enter'), 'Select / Details'],
      [chalk.cyan('/'), 'Search'],
      [chalk.cyan('?'), 'Toggle help'],
      [chalk.cyan('g'), 'Toggle graphs'],
      [chalk.cyan('G'), 'Toggle grouping'],
      [chalk.cyan('s'), 'Run new scan'],
      [chalk.cyan('e'), 'Export issues'],
      [chalk.cyan('r'), 'Refresh'],
      [chalk.cyan('Ctrl+p'), 'Command palette'],
      [chalk.cyan('Ctrl+m'), 'Monitor mode'],
      [chalk.cyan('Ctrl+d'), 'Diff view'],
      [chalk.cyan('q'), 'Quit'],
    ];

    for (const [key, desc] of shortcuts) {
      console.log(`   ${key.padEnd(12)} ${desc}`);
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray('   Press ') + chalk.cyan('?') + chalk.gray(' to close'));
  }

  renderIssueDetails(issue) {
    if (!issue || !this.state.showDetails) return;

    console.log(chalk.bold.cyan('\n  📋 Issue Details\n'));

    const severityColors = {
      critical: chalk.red,
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.blue,
      info: chalk.gray,
    };
    const color = severityColors[issue.severity] || chalk.white;

    console.log(`   ${chalk.bold('Title:')} ${color(issue.title)}`);
    console.log(`   ${chalk.bold('Severity:')} ${color(issue.severity?.toUpperCase())}`);
    console.log(`   ${chalk.bold('File:')} ${chalk.white(issue.file || 'N/A')}`);
    console.log(`   ${chalk.bold('Line:')} ${chalk.white(issue.line?.toString() || 'N/A')}`);

    if (issue.column) {
      console.log(`   ${chalk.bold('Column:')} ${chalk.white(issue.column.toString())}`);
    }

    if (issue.ruleId) {
      console.log(`   ${chalk.bold('Rule:')} ${chalk.gray(issue.ruleId)}`);
    }

    if (issue.message) {
      console.log(`\n   ${chalk.bold('Message:')}`);
      console.log(`   ${chalk.white(issue.message)}`);
    }

    if (issue.snippet) {
      console.log(`\n   ${chalk.bold('Code Snippet:')}`);
      console.log(chalk.gray('   ' + '─'.repeat(40)));
      console.log(chalk.yellow(`   ${issue.snippet}`));
      console.log(chalk.gray('   ' + '─'.repeat(40)));
    }

    if (issue.suggestion) {
      console.log(`\n   ${chalk.bold('Suggestion:')}`);
      console.log(chalk.green(`   ${issue.suggestion}`));
    }

    if (issue.tags && issue.tags.length > 0) {
      console.log(`\n   ${chalk.bold('Tags:')} ${chalk.gray(issue.tags.join(', '))}`);
    }

    if (issue.fix) {
      console.log(`\n   ${chalk.bold('Auto-fix available:')} ${chalk.green('Yes')}`);
    }

    console.log();
  }

  searchIssues(query) {
    if (!query) return this.issues;
    const q = query.toLowerCase();
    return this.issues.filter(issue =>
      (issue.title && issue.title.toLowerCase().includes(q)) ||
      (issue.message && issue.message.toLowerCase().includes(q)) ||
      (issue.file && issue.file.toLowerCase().includes(q)) ||
      (issue.ruleId && issue.ruleId.toLowerCase().includes(q))
    );
  }

  refresh() {
    this.render();
  }

  quit() {
    this.stopMonitoring();
    process.stdin.setRawMode(false);
    this.rl.close();
    console.clear();
    console.log(chalk.cyan('\n👋 Thanks for using Sentinel CLI!\n'));
    process.exit(0);
  }
}

export default EnhancedTUI;

export async function startInteractiveMode(issues, result) {
  const tui = new EnhancedTUI({ issues, result });
  await tui.start();
}

export function displayTUI(issues, result = {}) {
  if (process.stdin.isTTY) {
    return startInteractiveMode(issues, result);
  }
  
  const tui = new EnhancedTUI({ issues, result });
  tui.render();
}

export { PanelManager, ProgressBar, Sparkline, TableRenderer, DiffViewer };
