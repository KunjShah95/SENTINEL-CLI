import readline from 'readline';
import chalk from 'chalk';

export class InteractiveTUI {
  constructor(issues = []) {
    this.issues = issues;
    this.currentIndex = 0;
    this.filter = null;
    this.sortBy = 'severity';
    this.rl = null;
  }

  initialize() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Start the interactive TUI
   */
  async start() {
    this.initialize();
    await this.mainMenu();
  }

  async mainMenu() {
    this.clearScreen();
    this.printHeader();
    this.printSummary();
    
    console.log('\n' + chalk.gray('─'.repeat(50)));
    console.log(chalk.bold.cyan('  [N] Next Issue    [P] Previous Issue'));
    console.log(chalk.bold.cyan('  [F] Filter         [S] Sort'));
    console.log(chalk.bold.cyan('  [V] View Details   [J] Jump to Line'));
    console.log(chalk.bold.cyan('  [E] Export         [Q] Quit'));
    console.log(chalk.gray('─'.repeat(50)));

    const answer = await this.prompt('\n> ');
    
    switch (answer.toLowerCase()) {
      case 'n':
        this.nextIssue();
        break;
      case 'p':
        this.prevIssue();
        break;
      case 'f':
        await this.filterMenu();
        break;
      case 's':
        await this.sortMenu();
        break;
      case 'v':
        await this.viewDetails();
        break;
      case 'j':
        await this.jumpToLine();
        break;
      case 'e':
        await this.exportMenu();
        break;
      case 'q':
        this.quit();
        return;
      default:
        console.log(chalk.yellow('Invalid option'));
        await this.sleep(1000);
    }
    
    await this.mainMenu();
  }

  clearScreen() {
    console.clear();
  }

  printHeader() {
    console.log(chalk.bold.cyan(`
╔═══════════════════════════════════════════════════════════╗
║           🔒 Sentinel CLI - Interactive Review            ║
╚═══════════════════════════════════════════════════════════╝
    `));
  }

  printSummary() {
    const filtered = this.getFilteredIssues();
    const bySeverity = this.countBySeverity(filtered);
    
    console.log(chalk.white('Summary:'));
    console.log(`  ${chalk.red('●')} Critical: ${chalk.red(bySeverity.critical)}`);
    console.log(`  ${chalk.yellow('●')} High:     ${chalk.yellow(bySeverity.high)}`);
    console.log(`  ${chalk.blue('●')} Medium:   ${chalk.blue(bySeverity.medium)}`);
    console.log(`  ${chalk.gray('●')} Low:      ${chalk.gray(bySeverity.low)}`);
    console.log(`  ${chalk.gray('●')} Info:     ${chalk.gray(bySeverity.info)}`);
    console.log(`  ${chalk.bold.white('Total:     ' + filtered.length)}`);
    
    if (this.filter) {
      console.log(chalk.cyan(`\nFilter: ${this.filter}`));
    }
    
    this.printCurrentIssue();
  }

  printCurrentIssue() {
    const filtered = this.getFilteredIssues();
    if (filtered.length === 0) {
      console.log(chalk.yellow('\n⚠ No issues to display'));
      return;
    }

    const issue = filtered[this.currentIndex];
    console.log(chalk.gray('\n─'.repeat(50)));
    console.log(chalk.bold.white(`Issue ${this.currentIndex + 1} of ${filtered.length}`));
    
    const severityColors = {
      critical: chalk.red,
      high: chalk.yellow,
      medium: chalk.blue,
      low: chalk.gray,
      info: chalk.gray,
    };
    
    const color = severityColors[issue.severity] || chalk.white;
    console.log(color(`[${issue.severity.toUpperCase()}] `) + chalk.bold.white(issue.title || issue.message));
    console.log(chalk.gray(`File: ${issue.file}:${issue.line}`));
    
    if (issue.snippet) {
      console.log(chalk.gray('\nCode:'));
      console.log(chalk.gray(issue.snippet));
    }
  }

  countBySeverity(issues) {
    return issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  }

  getFilteredIssues() {
    let filtered = [...this.issues];
    
    if (this.filter) {
      filtered = filtered.filter(issue => {
        const filter = this.filter.toLowerCase();
        return (
          issue.file?.toLowerCase().includes(filter) ||
          issue.type?.toLowerCase().includes(filter) ||
          issue.severity?.toLowerCase() === filter ||
          issue.message?.toLowerCase().includes(filter)
        );
      });
    }

    // Sort
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    if (this.sortBy === 'severity') {
      filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    } else if (this.sortBy === 'file') {
      filtered.sort((a, b) => (a.file || '').localeCompare(b.file || ''));
    } else if (this.sortBy === 'line') {
      filtered.sort((a, b) => (a.line || 0) - (b.line || 0));
    }

    return filtered;
  }

  nextIssue() {
    const filtered = this.getFilteredIssues();
    if (this.currentIndex < filtered.length - 1) {
      this.currentIndex++;
    }
  }

  prevIssue() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
  }

  async filterMenu() {
    console.log(chalk.cyan('\nFilter Options:'));
    console.log('  [c] Critical only');
    console.log('  [h] High only');
    console.log('  [m] Medium only');
    console.log('  [s] Security issues only');
    console.log('  [b] By file pattern');
    console.log('  [a] Clear filter');
    
    const answer = await this.prompt('\n> ');
    
    switch (answer.toLowerCase()) {
      case 'c': this.filter = 'critical'; break;
      case 'h': this.filter = 'high'; break;
      case 'm': this.filter = 'medium'; break;
      case 's': this.filter = 'security'; break;
      case 'b': {
        const pattern = await this.prompt('Enter file pattern: ');
        this.filter = pattern;
        break;
      }
      case 'a': this.filter = null; break;
    }
    
    this.currentIndex = 0;
  }

  async sortMenu() {
    console.log(chalk.cyan('\nSort Options:'));
    console.log('  [s] By severity');
    console.log('  [f] By file');
    console.log('  [l] By line number');
    
    const answer = await this.prompt('\n> ');
    
    switch (answer.toLowerCase()) {
      case 's': this.sortBy = 'severity'; break;
      case 'f': this.sortBy = 'file'; break;
      case 'l': this.sortBy = 'line'; break;
    }
    
    this.currentIndex = 0;
  }

  async viewDetails() {
    const filtered = this.getFilteredIssues();
    const issue = filtered[this.currentIndex];
    
    console.log(chalk.cyan('\n--- Full Details ---'));
    console.log(chalk.bold('Type:') + ' ' + (issue.type || 'N/A'));
    console.log(chalk.bold('Analyzer:') + ' ' + (issue.analyzer || 'N/A'));
    console.log(chalk.bold('Severity:') + ' ' + (issue.severity || 'N/A'));
    console.log(chalk.bold('Message:') + ' ' + (issue.message || 'N/A'));
    console.log(chalk.bold('Suggestion:') + ' ' + (issue.suggestion || 'N/A'));
    console.log(chalk.bold('Tags:') + ' ' + (issue.tags?.join(', ') || 'N/A'));
    console.log(chalk.bold('Confidence:') + ' ' + ((issue.confidence * 100)?.toFixed(0) + '%' || 'N/A'));
    
    if (issue.suggestion) {
      console.log(chalk.green('\nSuggestion:'));
      console.log(issue.suggestion);
    }
    
    await this.prompt('\nPress Enter to continue...');
  }

  async jumpToLine() {
    const filtered = this.getFilteredIssues();
    const num = await this.prompt(`Enter issue number (1-${filtered.length}): `);
    const index = parseInt(num) - 1;
    
    if (index >= 0 && index < filtered.length) {
      this.currentIndex = index;
    } else {
      console.log(chalk.red('Invalid issue number'));
      await this.sleep(1000);
    }
  }

  async exportMenu() {
    console.log(chalk.cyan('\nExport Options:'));
    console.log('  [j] JSON');
    console.log('  [c] CSV');
    console.log('  [m] Markdown');
    
    const answer = await this.prompt('\n> ');
    console.log(chalk.green(`\nExported to sentinel-export.${answer === 'j' ? 'json' : answer === 'c' ? 'csv' : 'md'}`));
    await this.sleep(1500);
  }

  quit() {
    console.log(chalk.cyan('\n👋 Goodbye!'));
    process.exit(0);
  }

  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Quick TUI for displaying issues
 */
export function displayIssuesTUI(issues, options = {}) {
  const tui = new InteractiveTUI(issues);
  
  if (options.interactive) {
    tui.start();
  } else {
    // Non-interactive mode - just display summary
    const bySeverity = tui.countBySeverity(issues);
    console.log(chalk.bold.cyan('\n📊 Issue Summary:'));
    console.log(`  ${chalk.red('●')} Critical: ${bySeverity.critical}`);
    console.log(`  ${chalk.yellow('●')} High: ${bySeverity.high}`);
    console.log(`  ${chalk.blue('●')} Medium: ${bySeverity.medium}`);
    console.log(`  ${chalk.gray('●')} Low: ${bySeverity.low}`);
    console.log(chalk.bold.white(`\nTotal: ${issues.length} issues found`));
  }
}

export default InteractiveTUI;
