import chalk from 'chalk';

export class ThemeManager {
  constructor(options = {}) {
    this.theme = options.theme || 'rich';
    this.noColor = options.noColor || false;
  }

  getTheme(name) {
    const themes = {
      rich: {
        name: 'rich',
        severity: {
          critical: chalk.red.bold,
          high: chalk.red,
          medium: chalk.yellow,
          low: chalk.blue,
          info: chalk.gray
        },
        icons: {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🔵',
          info: '⚪',
          success: '✅',
          warning: '⚠️',
          error: '❌'
        },
        header: chalk.cyan,
        subheader: chalk.white,
        body: chalk.white,
        muted: chalk.gray,
        success: chalk.green,
        error: chalk.red,
        box: this.createBox()
      },
      minimal: {
        name: 'minimal',
        severity: {
          critical: (s) => `[${s.toUpperCase()}]`,
          high: (s) => `[${s.toUpperCase()}]`,
          medium: (s) => `[${s.toUpperCase()}]`,
          low: (s) => `[${s.toUpperCase()}]`,
          info: (s) => `[${s.toUpperCase()}]`
        },
        icons: {
          critical: '',
          high: '',
          medium: '',
          low: '',
          info: '',
          success: '',
          warning: '',
          error: ''
        },
        header: (s) => s,
        subheader: (s) => s,
        body: (s) => s,
        muted: (s) => s,
        success: (s) => s,
        error: (s) => s,
        box: this.createMinimalBox()
      },
      ci: {
        name: 'ci',
        severity: {
          critical: (s) => `::error::${s.toUpperCase()}`,
          high: (s) => `::warning::${s.toUpperCase()}`,
          medium: (s) => `::warning::${s.toUpperCase()}`,
          low: (s) => s,
          info: (s) => s
        },
        icons: {
          critical: '##[error]',
          high: '##[warning]',
          medium: '##[warning]',
          low: '',
          info: '',
          success: '##[success]',
          warning: '##[warning]',
          error: '##[error]'
        },
        header: (s) => s,
        subheader: (s) => s,
        body: (s) => s,
        muted: (s) => s,
        success: (s) => `##[success]${s}`,
        error: (s) => `##[error]${s}`,
        box: this.createCIBox()
      }
    };

    return themes[name] || themes.rich;
  }

  createBox() {
    return {
      start: '┌' + '─'.repeat(50) + '┐',
      mid: '├' + '─'.repeat(50) + '┤',
      end: '└' + '─'.repeat(50) + '┘',
      side: '│'
    };
  }

  createMinimalBox() {
    return {
      start: '',
      mid: '',
      end: '',
      side: ''
    };
  }

  createCIBox() {
    return {
      start: '::group::',
      mid: '',
      end: '::endgroup::',
      side: ''
    };
  }

  formatSeverity(severity) {
    const theme = this.getTheme(this.theme);

    if (this.theme === 'ci') {
      return theme.severity[severity]?.(`[${severity.toUpperCase()}]`) || severity;
    }

    return theme.severity[severity]?.(severity) || severity;
  }

  formatIcon(icon) {
    const theme = this.getTheme(this.theme);

    if (this.noColor) {
      return '';
    }

    return theme.icons[icon] || '';
  }

  formatIssue(issue) {
    const theme = this.getTheme(this.theme);

    if (this.theme === 'ci') {
      const severity = issue.severity || 'low';
      const icon = severity === 'critical' || severity === 'high' ? 'error' : 'warning';
      return `${theme.icons[icon]} ${issue.file}:${issue.line} - ${issue.message}`;
    }

    const icon = this.formatIcon(issue.severity);
    const severity = this.formatSeverity(issue.severity);

    return `${icon} ${severity} · ${issue.file}:${issue.line}\n  ${issue.message}`;
  }

  formatHeader(text) {
    const theme = this.getTheme(this.theme);
    return theme.header(text);
  }

  formatSuccess(text) {
    const theme = this.getTheme(this.theme);
    return theme.success(text);
  }

  formatError(text) {
    const theme = this.getTheme(this.theme);
    return theme.error(text);
  }

  formatBody(text) {
    const theme = this.getTheme(this.theme);
    return theme.body(text);
  }
}

export function getTheme(name = 'rich', options = {}) {
  const manager = new ThemeManager({ ...options, theme: name });
  return manager.getTheme(name);
}

export default { ThemeManager, getTheme };
